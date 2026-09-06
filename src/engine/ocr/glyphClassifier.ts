/**
 * Template-matching recogniser for very short labels (class names such as
 * "٢/ب", period digits such as "٤"). General OCR engines are unreliable on
 * 1–4 isolated Arabic glyphs, so the pipeline uses this as a specialised
 * second opinion. It segments the crop into glyph groups and compares each
 * one with pre-rendered templates in several Arabic fonts.
 */
import type { BinaryImage, GrayImage } from '../types';
import { connectedComponents } from '../image/components';
import { globalThreshold, otsuThreshold } from '../image/threshold';
import { GLYPH_ATLAS, GLYPH_SIZE } from './glyphAtlas';

interface Template {
  symbol: string;
  aspect: number;
  data: Float32Array;
  norm: number;
}

let templates: Template[] | null = null;

function decodeBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node (no atob in very old runtimes): decode manually
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (table.indexOf(clean[i]) << 18) | (table.indexOf(clean[i + 1]) << 12) | ((table.indexOf(clean[i + 2]) & 63) << 6) | (table.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (clean[i + 2] !== undefined) out[o++] = (n >> 8) & 255;
    if (clean[i + 3] !== undefined) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

function loadTemplates(): Template[] {
  if (templates) return templates;
  templates = GLYPH_ATLAS.map((t) => {
    const bytes = decodeBase64(t.data);
    const data = new Float32Array(bytes.length);
    let norm = 0;
    for (let i = 0; i < bytes.length; i++) {
      data[i] = bytes[i] / 255;
      norm += data[i] * data[i];
    }
    return { symbol: t.symbol, aspect: t.aspect, data, norm };
  });
  return templates;
}

interface Group {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  /** Original components that were merged into this group. */
  parts: Group[];
}

function groupComponents(comps: Group[]): Group[] {
  let groups = comps.map((c) => ({ ...c, parts: [c] }));
  let changed = true;
  while (changed) {
    changed = false;
    groups.sort((a, b) => a.x0 - b.x0);
    const next: Group[] = [];
    for (const g of groups) {
      const last = next[next.length - 1];
      if (last) {
        const overlap = Math.min(last.x1, g.x1) - Math.max(last.x0, g.x0) + 1;
        const minW = Math.min(last.x1 - last.x0 + 1, g.x1 - g.x0 + 1);
        if (overlap > 0 && overlap / minW >= 0.45) {
          last.x0 = Math.min(last.x0, g.x0);
          last.x1 = Math.max(last.x1, g.x1);
          last.y0 = Math.min(last.y0, g.y0);
          last.y1 = Math.max(last.y1, g.y1);
          last.area += g.area;
          last.parts = [...last.parts, ...g.parts];
          changed = true;
          continue;
        }
      }
      next.push(g);
    }
    groups = next;
  }
  return groups;
}

/** Splits a wide group at the column with the least ink (right part first). */
function splitAtValley(bin: BinaryImage, g: Group): Group[] | null {
  const w = g.x1 - g.x0 + 1;
  const h = g.y1 - g.y0 + 1;
  if (w < 8 || w / h < 0.8) return null;
  const proj: number[] = [];
  for (let x = g.x0; x <= g.x1; x++) {
    let n = 0;
    for (let y = g.y0; y <= g.y1; y++) n += bin.data[y * bin.width + x];
    proj.push(n);
  }
  const mean = proj.reduce((a, b) => a + b, 0) / proj.length;
  let best = -1;
  let bestVal = Infinity;
  for (let i = Math.floor(w * 0.25); i <= Math.ceil(w * 0.75); i++) {
    if (proj[i] < bestVal) {
      bestVal = proj[i];
      best = i;
    }
  }
  if (best < 0 || bestVal > mean * 0.4) return null;
  const tight = (x0: number, x1: number): Group | null => {
    let y0 = g.y1;
    let y1 = g.y0;
    let tx0 = x1;
    let tx1 = x0;
    let area = 0;
    for (let y = g.y0; y <= g.y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!bin.data[y * bin.width + x]) continue;
        area++;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (x < tx0) tx0 = x;
        if (x > tx1) tx1 = x;
      }
    }
    return area < 3 ? null : { x0: tx0, y0, x1: tx1, y1, area, parts: [] };
  };
  const right = tight(g.x0 + best + 1, g.x1);
  const left = tight(g.x0, g.x0 + best - 1);
  if (!right || !left) return null;
  return [right, left];
}

/**
 * Area-averaged resample of a glyph into a SIZE×SIZE float map, keeping the
 * aspect ratio (the glyph is fitted and centred, like the templates).
 */
function sampleGlyph(bin: BinaryImage, g: Group): Float32Array {
  const S = GLYPH_SIZE;
  const out = new Float32Array(S * S);
  const w = g.x1 - g.x0 + 1;
  const h = g.y1 - g.y0 + 1;
  const scale = S / Math.max(w, h);
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const ox = Math.floor((S - dw) / 2);
  const oy = Math.floor((S - dh) / 2);
  for (let y = 0; y < dh; y++) {
    const sy0 = g.y0 + Math.floor((y * h) / dh);
    const sy1 = Math.max(sy0 + 1, g.y0 + Math.floor(((y + 1) * h) / dh));
    for (let x = 0; x < dw; x++) {
      const sx0 = g.x0 + Math.floor((x * w) / dw);
      const sx1 = Math.max(sx0 + 1, g.x0 + Math.floor(((x + 1) * w) / dw));
      let sum = 0;
      let n = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        for (let xx = sx0; xx < sx1; xx++) {
          sum += bin.data[yy * bin.width + xx];
          n++;
        }
      }
      out[(oy + y) * S + ox + x] = n ? sum / n : 0;
    }
  }
  return out;
}

function matchGlyph(sample: Float32Array, aspect: number): { symbol: string; score: number } {
  let sampleNorm = 0;
  for (let i = 0; i < sample.length; i++) sampleNorm += sample[i] * sample[i];
  let best = { symbol: '?', score: 0 };
  for (const t of loadTemplates()) {
    let dot = 0;
    for (let i = 0; i < sample.length; i++) dot += sample[i] * t.data[i];
    const dice = (2 * dot) / (sampleNorm + t.norm + 1e-6);
    const r = Math.min(aspect, t.aspect) / Math.max(aspect, t.aspect);
    const score = dice * (0.55 + 0.45 * r);
    if (score > best.score) best = { symbol: t.symbol, score };
  }
  return best;
}

export interface ShortLabelResult {
  text: string;
  /** 0..1 */
  confidence: number;
  glyphs: number;
}

const DIGIT = /[0-9٠-٩]/;

function digitsToAscii(t: string): string {
  return t.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** Numbers are written left-to-right even inside RTL text: restore digit runs. */
function restoreOrder(chars: string[]): string {
  const restored: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) restored.push(...run.reverse());
    run = [];
  };
  for (const ch of chars) {
    if (DIGIT.test(ch)) run.push(ch);
    else {
      flush();
      restored.push(ch);
    }
  }
  flush();
  return restored.join('');
}

/**
 * Recognises a short label in a cell crop. Returns null when the crop looks
 * like a word (too many glyph groups) or contains no usable ink.
 */
export function recognizeShortLabel(crop: GrayImage, maxGlyphs = 6): ShortLabelResult | null {
  const t = otsuThreshold(crop);
  if (t < 40 || t > 230) return null;
  const bin = globalThreshold(crop, t);
  const comps = connectedComponents(bin, 3);
  if (!comps.length) return null;
  const largest = Math.max(...comps.map((c) => c.area));
  const maxH = Math.max(...comps.map((c) => c.y1 - c.y0 + 1));
  const kept: Group[] = comps
    .filter((c) => c.area >= Math.max(3, largest * 0.01) && c.y1 - c.y0 + 1 >= Math.max(2, maxH * 0.08))
    .map((c) => ({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, area: c.area, parts: [] as Group[] }));
  if (!kept.length) return null;
  const groups = groupComponents(kept);
  if (groups.length > maxGlyphs) return null;
  // Read right-to-left (visual order of Arabic).
  groups.sort((a, b) => b.x0 - a.x0);
  const cache = new Map<Group, { symbol: string; score: number }>();
  const classify = (g: Group) => {
    let m = cache.get(g);
    if (!m) {
      const sample = sampleGlyph(bin, g);
      const aspect = (g.x1 - g.x0 + 1) / (g.y1 - g.y0 + 1);
      m = matchGlyph(sample, aspect);
      cache.set(g, m);
    }
    return m;
  };
  // Each group may be read whole, or split (touching glyphs in blurry photos).
  // We enumerate the alternatives and keep the reading with the best mean score,
  // with a bonus for strings that look like a class label or a period number.
  const alternatives: Group[][][] = groups.map((g) => {
    const alts: Group[][] = [[g]];
    if (g.parts.length > 1 && g.parts.length <= 3) alts.push([...g.parts].sort((a, b) => b.x0 - a.x0));
    const split = splitAtValley(bin, g);
    if (split) alts.push(split);
    return alts;
  });
  let bestChars: string[] = [];
  let bestScore = -1;
  let bestMean = 0;
  let bestMin = 0;
  const walk = (i: number, pieces: Group[]) => {
    if (i === alternatives.length) {
      if (pieces.length > maxGlyphs + 1) return;
      const ms = pieces.map(classify);
      const mean = ms.reduce((acc, x) => acc + x.score, 0) / ms.length;
      const min = Math.min(...ms.map((x) => x.score));
      const chars = ms.map((x) => x.symbol);
      const text = restoreOrder(chars);
      const plausible = /^(\d{1,2}|\d\s?[/-]\s?[ء-يa-zA-Z0-9]|[ء-يa-zA-Z][/-]\d|\d[ء-ي])$/.test(digitsToAscii(text));
      const total = 0.7 * mean + 0.3 * min + (plausible ? 0.08 : 0) - (pieces.length - groups.length) * 0.05;
      if (total > bestScore) {
        bestScore = total;
        bestChars = chars;
        bestMean = mean;
        bestMin = min;
      }
      return;
    }
    for (const alt of alternatives[i]) walk(i + 1, [...pieces, ...alt]);
  };
  walk(0, []);
  const chars = bestChars;
  const scoreSum = bestMean * Math.max(1, chars.length);
  const glyphCount = Math.max(1, chars.length);
  const restored = [...restoreOrder(chars)];
  // Contextual disambiguation for "digit / letter" patterns.
  if (restored.length === 3 && (restored[1] === '/' || restored[1] === '-')) {
    if (restored[0] === 'ا' || restored[0] === 'أ' || restored[0] === '|') restored[0] = '١';
    if (restored[2] === '١' || restored[2] === '1') restored[2] = 'ا';
  }
  const text = restored.join('');
  // Separator-only ink (a dash marking a free period) → empty label.
  if (/^[-/]+$/.test(text)) return { text: '', confidence: 0.9, glyphs: chars.length };
  // Class labels and period numbers always carry a digit; anything else is a word for the OCR.
  if (!DIGIT.test(text)) return null;
  // Confidence blends the mean and the weakest glyph: one unreadable glyph
  // (typically part of a word that is not a label at all) sinks the reading.
  const mean = scoreSum / glyphCount;
  const blended = 0.6 * mean + 0.4 * bestMin;
  const confidence = Math.max(0, Math.min(1, (blended - 0.45) / 0.4));
  return { text, confidence, glyphs: chars.length };
}
