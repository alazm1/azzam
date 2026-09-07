/**
 * Reads a university timetable photo through the same Cloudflare Worker as
 * the teacher edition (request field `mode: 'university'`). There is no
 * on-device fallback for time-based grids: when the reader is unavailable the
 * student adds lectures by hand.
 */
import { encodeForUpload, loadSmartReaderConfig } from '../services/smartReader';
import { DAY_KEYS, newId, parseTime, type DayKey, type Lecture } from './model';

export interface SmartLecture {
  day: string;
  start: string;
  end: string;
  course: string;
  room?: string;
  uncertain?: boolean;
}

export interface SmartUniversityResponse {
  ok?: boolean;
  error?: string;
  lectures?: SmartLecture[];
  notes?: string;
}

const DAY_ALIASES: Record<string, DayKey> = {
  sunday: 'sun', monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat',
  u: 'sun', m: 'mon', t: 'tue', w: 'wed', r: 'thu', f: 'fri', s: 'sat',
  'الأحد': 'sun', 'الاحد': 'sun', 'الإثنين': 'mon', 'الاثنين': 'mon', 'الثلاثاء': 'tue', 'الأربعاء': 'wed', 'الاربعاء': 'wed', 'الخميس': 'thu', 'الجمعة': 'fri', 'السبت': 'sat',
};

/** sun | Sunday | U | الأحد → 'sun' (the model is asked for keys, this is a safety net). */
export function normalizeDay(v: unknown): DayKey | null {
  const raw = String(v ?? '').trim().toLowerCase();
  if (DAY_KEYS.includes(raw as DayKey)) return raw as DayKey;
  return DAY_ALIASES[raw] ?? DAY_ALIASES[raw.slice(0, 3)] ?? null;
}

/** Normalises the model output: valid days, HH:MM times, deduplicated, sorted. */
export function smartResponseToLectures(res: SmartUniversityResponse): Lecture[] | null {
  if (!res.ok || !Array.isArray(res.lectures)) return null;
  const out: Lecture[] = [];
  const seen = new Set<string>();
  for (const l of res.lectures) {
    const day = normalizeDay(l.day);
    if (!day) continue;
    const start = parseTime(String(l.start ?? ''));
    let end = parseTime(String(l.end ?? ''));
    if (start === null) continue;
    if (end === null || end <= start) end = Math.min(start + 50, 24 * 60);
    const course = String(l.course ?? '').replace(/\s+/g, ' ').trim();
    if (!course) continue;
    const key = `${day}:${start}:${course}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const room = String(l.room ?? '').replace(/\s+/g, ' ').trim();
    out.push({ id: newId(), day, start, end, course, room: room || undefined, needsReview: l.uncertain ? true : undefined });
  }
  return out;
}

export type StudentReadOutcome = { kind: 'ok'; lectures: Lecture[]; notes?: string } | { kind: 'unavailable'; reason: string };

export async function readUniversitySchedule(file: Blob, timeoutMs = 60_000): Promise<StudentReadOutcome> {
  const { url } = await loadSmartReaderConfig();
  if (!url) return { kind: 'unavailable', reason: 'not-configured' };
  try {
    const payload = await encodeForUpload(file);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, mode: 'university' }),
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (res.status === 429) return { kind: 'unavailable', reason: 'quota' };
    if (!res.ok) return { kind: 'unavailable', reason: `http-${res.status}` };
    const data = (await res.json()) as SmartUniversityResponse;
    const lectures = smartResponseToLectures(data);
    // خادم قديم (قبل دعم وضع الجامعة) يعيد "lessons" بدل "lectures"
    if (!lectures) return { kind: 'unavailable', reason: data.error ?? (Array.isArray((data as { lessons?: unknown }).lessons) ? 'worker-outdated' : 'bad-response') };
    return { kind: 'ok', lectures, notes: data.notes };
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error ? e.name : 'error' };
  }
}
