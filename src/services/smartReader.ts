/**
 * "القراءة الذكية": sends the photo to the owner's Cloudflare Worker, which
 * asks Google Gemini to read the schedule. Falls back to the on-device engine
 * when the reader is not configured, unreachable, out of quota, or returns
 * too little. The Worker URL comes from public/smart-reader.json at runtime.
 */
import { parseClassName, matchSubject, matchWaiting } from '../engine/parse/classify';
import { normalizeArabic } from '../engine/parse/normalize';
import type { DayKey, ExtractedLesson, ExtractionResult } from '../engine/types';

const DAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu'];
const STORAGE_KEY = 'jadwal-almuallim:smart-reader';

export interface SmartReaderConfig {
  url: string;
}

let configPromise: Promise<SmartReaderConfig> | null = null;

/** Loads the reader URL from the site (cached for the session). */
export function loadSmartReaderConfig(): Promise<SmartReaderConfig> {
  if (!configPromise) {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    configPromise = fetch(`${base}smart-reader.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { url: '' }))
      .then((j: { url?: string }) => ({ url: typeof j.url === 'string' ? j.url.trim() : '' }))
      .catch(() => ({ url: '' }));
  }
  return configPromise;
}

/** Teacher's preference (default on). */
export function smartReaderEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSmartReaderEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // ignore
  }
}

/** Downsizes the photo (long side ≤ 1600 px) and encodes it as JPEG base64. */
export async function encodeForUpload(file: Blob): Promise<{ image: string; mime: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return { image: dataUrl.slice(dataUrl.indexOf(',') + 1), mime: 'image/jpeg' };
}

export interface SmartLesson {
  day: string;
  period: number;
  className: string;
  subject?: string;
}

export interface SmartResponse {
  ok?: boolean;
  error?: string;
  periodsCount?: number | null;
  lessons?: SmartLesson[];
  notes?: string;
}

/** Canonicalises what the model returned so it looks like the local engine's output. */
export function smartResponseToResult(res: SmartResponse, startedAt: number): ExtractionResult | null {
  if (!res.ok || !Array.isArray(res.lessons)) return null;
  const lessons: ExtractedLesson[] = [];
  const seen = new Set<string>();
  for (const l of res.lessons) {
    const day = l.day as DayKey;
    if (!DAYS.includes(day) || !Number.isInteger(l.period) || l.period < 1 || l.period > 12) continue;
    const key = `${day}:${l.period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rawClass = String(l.className ?? '').trim();
    const norm = normalizeArabic(rawClass);
    const waiting = rawClass ? matchWaiting(norm) : undefined;
    const parsed = rawClass && !waiting ? parseClassName(norm, true) : null;
    const subjectRaw = String(l.subject ?? '').trim();
    const subjectMatch = subjectRaw ? matchSubject(normalizeArabic(subjectRaw)) : null;
    // المطلوب اسم المادة فقط؛ عناوين الدروس الطويلة (٣ كلمات فأكثر) تُهمل
    const shortSubject = subjectRaw && subjectRaw.split(/\s+/).length <= 2 && subjectRaw.length <= 16 ? subjectRaw : undefined;
    lessons.push({
      day,
      period: l.period,
      className: waiting ?? parsed?.className ?? rawClass,
      subject: subjectMatch?.subject ?? shortSubject,
      rawText: [rawClass, subjectRaw].filter(Boolean).join('\n'),
      confidence: 0.9,
      source: { row: 0, col: 0 },
    });
  }
  const days = DAYS.filter((d) => lessons.some((l) => l.day === d));
  const maxPeriod = Math.max(0, ...lessons.map((l) => l.period), res.periodsCount ?? 0);
  const periods = Array.from({ length: Math.min(12, maxPeriod) }, (_, i) => i + 1);
  const ok = lessons.length >= 3 && days.length >= 3;
  return {
    status: ok ? 'ok' : 'failed',
    message: ok ? undefined : 'لم نتمكن من قراءة الجدول بشكل كافٍ. حاول تصوير الجدول بشكل أوضح بحيث تظهر جميع الصفوف والأعمدة.',
    orientation: 'days-in-rows',
    days,
    periods,
    lessons,
    cells: [],
    grid: null,
    warnings: res.notes ? [res.notes] : [],
    stats: {
      cellsTotal: 0,
      cellsWithText: lessons.length,
      daysDetected: days.length,
      periodsDetected: periods.length,
      lessonsDetected: lessons.length,
      lowConfidence: 0,
      mediumConfidence: 0,
      quality: ok ? 0.95 : 0.3,
      durationMs: Date.now() - startedAt,
      rotationApplied: 0,
      gridMethod: 'lines',
      perspectiveCorrected: false,
      textHeightPx: 0,
    },
  };
}

export type SmartOutcome = { kind: 'ok'; result: ExtractionResult } | { kind: 'unavailable'; reason: string };

/** Calls the reader; never throws — unavailability is reported so the caller can fall back. */
export async function readWithSmartReader(file: Blob, url: string, timeoutMs = 45_000): Promise<SmartOutcome> {
  const started = Date.now();
  try {
    const payload = await encodeForUpload(file);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (res.status === 429) return { kind: 'unavailable', reason: 'quota' };
    if (!res.ok) return { kind: 'unavailable', reason: `http-${res.status}` };
    const data = (await res.json()) as SmartResponse;
    const result = smartResponseToResult(data, started);
    if (!result) return { kind: 'unavailable', reason: data.error ?? 'bad-response' };
    return { kind: 'ok', result };
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error ? e.name : 'error' };
  }
}
