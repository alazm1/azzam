import type { CellKind, CellRead, DayKey, ParsedCell } from '../types';
import { bestMatch, similarity } from './fuzzy';
import { DAY_LEXICON, GRADE_NAMES_AR, GRADE_WORDS, HEADER_WORDS, PERIOD_ORDINALS, PERIOD_WORDS, SECTION_LETTERS, STAGE_WORDS, SUBJECTS } from './lexicon';
import { hasContent, lettersOnly, normalizeArabic, toArabicDigits, tokens } from './normalize';

export interface DayMatch {
  day: DayKey;
  score: number;
}

export interface PeriodMatch {
  period: number;
  score: number;
}

export interface ClassMatch {
  className: string;
  score: number;
  /** Text with the class-name part removed (used to find the subject). */
  rest: string;
}

export interface SubjectMatch {
  subject: string;
  score: number;
  rest: string;
}

const DAY_PREFIX = /^(يوم|اليوم)\s*/;

/** Recognises a week-day label; tolerant to OCR noise. */
export function matchDay(norm: string): DayMatch | null {
  const cleaned = norm.replace(/\n/g, ' ').replace(DAY_PREFIX, '').trim();
  const candidates = new Set<string>();
  candidates.add(lettersOnly(cleaned));
  for (const t of tokens(cleaned)) candidates.add(lettersOnly(t));
  let best: DayMatch | null = null;
  for (const c of candidates) {
    if (c.length < 3) continue;
    const minScore = c.length <= 4 ? 0.75 : 0.66;
    const m = bestMatch(c, DAY_LEXICON, minScore);
    if (m && (!best || m.score > best.score)) best = { day: m.key, score: m.score };
  }
  return best;
}

const TIME_RE = /\b\d{1,2}\s*[:.]\s*\d{2}\b/;

/** Recognises a period header ("الحصة الثالثة", "٣", "ح3", "الثالثة 9:00"). */
export function matchPeriod(norm: string): PeriodMatch | null {
  let s = norm.replace(/\n/g, ' ');
  s = s.replace(TIME_RE, ' ').replace(/\b(am|pm|ص|م)\b/g, ' ');
  const toks = tokens(s)
    .map((t) => t.replace(/^ح(?=\d)/, '').replace(/(?<=\d)ح$/, '')) // "ح5" / "5ح"
    .filter((t) => !PERIOD_WORDS.includes(lettersOnly(t)) && lettersOnly(t) !== 'ح');
  if (!toks.length) return null;
  // pure numeric
  if (toks.length === 1 && /^\d{1,2}$/.test(toks[0])) {
    const n = Number(toks[0]);
    if (n >= 1 && n <= 12) return { period: n, score: 0.95 };
    return null;
  }
  // "ح3" / "3ح"
  const glued = toks.length === 1 ? toks[0].match(/^(?:ح)?(\d{1,2})(?:ح)?$/) : null;
  if (glued) {
    const n = Number(glued[1]);
    if (n >= 1 && n <= 12) return { period: n, score: 0.9 };
  }
  let best: PeriodMatch | null = null;
  for (const t of toks) {
    const letters = lettersOnly(t);
    if (letters.length < 3) continue;
    const m = bestMatch(letters, PERIOD_ORDINALS, 0.7);
    if (m && (!best || m.score > best.score)) best = { period: m.key, score: m.score };
  }
  if (best && toks.length <= 3) return best;
  // digit accompanied by the word "الحصة" e.g. "الحصة 4"
  const digit = toks.find((t) => /^\d{1,2}$/.test(t));
  if (digit && /حص/.test(norm)) {
    const n = Number(digit);
    if (n >= 1 && n <= 12) return { period: n, score: 0.85 };
  }
  return best;
}

const SECTION_CLASS = 'ابجدهوزحطي';
const SEP = '\\s*[/\\-]\\s*';

function sectionDisplay(raw: string): string {
  const k = raw.toLowerCase();
  return SECTION_LETTERS[k] ?? raw;
}

/**
 * Recognises class / section names in the many forms used in Saudi schools:
 *   ٢/أ  2/ب  أ/2  2ب  ثاني متوسط أ  الصف الثالث ب  ثالث ثانوي/ب  3-1
 */
export function parseClassName(norm: string): ClassMatch | null {
  const s = norm.replace(/\n/g, ' ');
  // Worded forms ("ثاني متوسط أ") take priority when a stage word is present:
  // a stray digit/letter fragment elsewhere in the cell must not win.
  if (/متوسط|ابتدائ|ثانوي|صف/.test(s)) {
    const worded = parseWordedClass(s);
    if (worded) return worded;
  }
  // digit / letter
  let re = new RegExp(`(?<![\\d])(\\d{1,2})${SEP}([${SECTION_CLASS}a-fA-F])(?![ء-يa-zA-Z])`);
  let m = s.match(re);
  if (m) {
    const grade = Number(m[1]);
    if (grade >= 1 && grade <= 12) {
      return { className: `${toArabicDigits(grade)}/${sectionDisplay(m[2])}`, score: 1, rest: s.replace(m[0], ' ') };
    }
  }
  // letter / digit (RTL reading order from OCR)
  re = new RegExp(`(?<![ء-يa-zA-Z])([${SECTION_CLASS}a-fA-F])${SEP}(\\d{1,2})(?![\\d])`);
  m = s.match(re);
  if (m) {
    const grade = Number(m[2]);
    if (grade >= 1 && grade <= 12) {
      return { className: `${toArabicDigits(grade)}/${sectionDisplay(m[1])}`, score: 0.95, rest: s.replace(m[0], ' ') };
    }
  }
  // digit / digit  (e.g. 3/1 = grade 3 section 1)
  m = s.match(/(?<![\d])(\d{1,2})\s*[/-]\s*(\d{1,2})(?![\d])/);
  if (m && !TIME_RE.test(m[0])) {
    const grade = Number(m[1]);
    const section = Number(m[2]);
    if (grade >= 1 && grade <= 12 && section >= 1 && section <= 20) {
      return { className: `${toArabicDigits(grade)}/${toArabicDigits(section)}`, score: 0.85, rest: s.replace(m[0], ' ') };
    }
  }
  // glued digit+letter  "2ب"  or "ب2"
  m = s.match(new RegExp(`(?<![\\dء-ي])(\\d{1,2})\\s?([${SECTION_CLASS}])(?![ء-ي])`)) ?? s.match(new RegExp(`(?<![ء-ي])([${SECTION_CLASS}])\\s?(\\d{1,2})(?![\\dء-ي])`));
  if (m) {
    const digit = /^\d/.test(m[1]) ? m[1] : m[2];
    const letter = /^\d/.test(m[1]) ? m[2] : m[1];
    const grade = Number(digit);
    if (grade >= 1 && grade <= 12) {
      return { className: `${toArabicDigits(grade)}/${sectionDisplay(letter)}`, score: 0.8, rest: s.replace(m[0], ' ') };
    }
  }
  return parseWordedClass(s);
}

/** Worded class names: [الصف] <ordinal> [stage] [section]. */
function parseWordedClass(s: string): ClassMatch | null {
  const toks = tokens(s);
  for (let i = 0; i < toks.length; i++) {
    const t = lettersOnly(toks[i]);
    if (!t) continue;
    const g = bestMatch(t, GRADE_WORDS, 0.8);
    if (!g) continue;
    const prevIsSaf = i > 0 && /^(ال)?صف$/.test(lettersOnly(toks[i - 1]));
    let stage: string | null = null;
    let section: string | null = null;
    let consumed = 1;
    const st = matchStage(toks[i + 1] ? lettersOnly(toks[i + 1]) : '', toks[i + 2] ? lettersOnly(toks[i + 2]) : '');
    if (st) {
      stage = st.stage;
      section = st.section;
      consumed = 1 + st.consumed;
    }
    const after = !section && toks[i + consumed] ? toks[i + consumed] : '';
    if (after && after.length === 1 && SECTION_CLASS.includes(after)) {
      section = sectionDisplay(after);
      consumed++;
    } else if (after && /^\d{1,2}$/.test(after)) {
      section = toArabicDigits(after);
      consumed++;
    }
    if (!stage && !section && !prevIsSaf) continue; // probably a period ordinal
    const parts = [GRADE_NAMES_AR[g.key]];
    if (stage) parts.push(stage);
    if (section) parts.push(section);
    const rest = [...toks.slice(0, prevIsSaf ? i - 1 : i), ...toks.slice(i + consumed)].join(' ');
    return { className: parts.join(' '), score: stage || section ? 0.95 : 0.75, rest };
  }
  // Grade word garbled by OCR but a stage word survived: "0 ني متوسط أ" → ثاني متوسط أ
  for (let i = 1; i < toks.length; i++) {
    const st = matchStage(lettersOnly(toks[i]), toks[i + 1] ? lettersOnly(toks[i + 1]) : '');
    if (!st) continue;
    let g: ReturnType<typeof bestMatch<number>> = null;
    let gradeIdx = i - 1;
    for (let k = i - 1; k >= Math.max(0, i - 3) && !g; k--) {
      const prev = lettersOnly(toks[k]);
      if (prev.length < 2) continue;
      g = bestMatch(prev, GRADE_WORDS, 0.5);
      gradeIdx = k;
    }
    if (!g) continue;
    let section = st.section;
    let consumed = i + st.consumed;
    const after = toks[consumed] ?? '';
    if (!section && after.length === 1 && SECTION_CLASS.includes(after)) {
      section = sectionDisplay(after);
      consumed++;
    }
    const parts = [GRADE_NAMES_AR[g.key], st.stage];
    if (section) parts.push(section);
    const rest = [...toks.slice(0, gradeIdx), ...toks.slice(consumed)].join(' ');
    return { className: parts.join(' '), score: 0.6, rest };
  }
  return null;
}

const LONG_STAGES: Array<[string, string[]]> = STAGE_WORDS.map(([k, v]) => [k, v.filter((x) => x.length > 1)]);

/**
 * Matches a stage word ("متوسط") possibly with the section letter glued to
 * it ("متوسطأ") or split across two tokens ("متو" + "سطب").
 */
function matchStage(tok: string, nextTok: string): { stage: string; section: string | null; consumed: number } | null {
  const tryOne = (t: string, consumed: number) => {
    if (t.length < 2) return null;
    if (t.length > 3 && SECTION_CLASS.includes(t[t.length - 1])) {
      const glued = bestMatch(t.slice(0, -1), LONG_STAGES, 0.9);
      if (glued) return { stage: glued.key, section: sectionDisplay(t[t.length - 1]), consumed };
    }
    const whole = bestMatch(t, LONG_STAGES, 0.75);
    return whole ? { stage: whole.key, section: null, consumed } : null;
  };
  return tryOne(tok, 1) ?? (nextTok ? tryOne(tok + nextTok, 2) : null);
}

/** Finds a known subject inside the text (single or two-word variants). */
export function matchSubject(norm: string): SubjectMatch | null {
  const toks = tokens(norm.replace(/\n/g, ' '));
  let best: (SubjectMatch & { span: [number, number] }) | null = null;
  for (let i = 0; i < toks.length; i++) {
    for (let len = 1; len <= 3 && i + len <= toks.length; len++) {
      const phrase = toks
        .slice(i, i + len)
        .map(lettersOnly)
        .filter(Boolean)
        .join(' ');
      if (phrase.replace(/ /g, '').length < 3) continue;
      const minScore = phrase.length <= 4 ? 0.8 : 0.72;
      const m = bestMatch(phrase, SUBJECTS, minScore);
      if (m && (!best || m.score > best.score || (m.score === best.score && len > best.span[1] - best.span[0]))) {
        best = { subject: m.key, score: m.score, rest: '', span: [i, i + len] };
      }
    }
  }
  if (!best) return null;
  best.rest = [...toks.slice(0, best.span[0]), ...toks.slice(best.span[1])].join(' ');
  return best;
}

export function isHeaderWord(norm: string): boolean {
  const letters = lettersOnly(norm.replace(/\n/g, ' '));
  if (!letters) return false;
  return HEADER_WORDS.some((h) => similarity(letters, lettersOnly(h)) >= 0.8);
}

function looksLikeTime(norm: string): boolean {
  return TIME_RE.test(norm) && lettersOnly(norm).length <= 2;
}

/** Classifies a single OCR cell into day / period / lesson / other / empty. */
export function classifyCell(cell: CellRead): ParsedCell {
  const rawText = cell.text ?? '';
  const norm = normalizeArabic(rawText);
  const ocrConfidence = Math.max(0, Math.min(1, cell.ocrConfidence / 100));
  const base = {
    row: cell.row,
    col: cell.col,
    rowSpan: cell.rowSpan,
    colSpan: cell.colSpan,
    rawText,
    normalizedText: norm,
    ocrConfidence,
  };
  if (!hasContent(norm)) return { ...base, kind: 'empty', parseConfidence: 1 };

  const toks = tokens(norm.replace(/\n/g, ' '));
  const cls = parseClassName(norm);
  const subject = matchSubject(cls ? cls.rest : norm);
  if (isHeaderWord(norm) && !cls && !subject) {
    return { ...base, kind: 'other', parseConfidence: 0.9 };
  }
  // Day names and period ordinals are both short Arabic words; pick the better match.
  const day = matchDay(norm);
  const period = !cls ? matchPeriod(norm) : null;
  const dayScore = day ? day.score : 0;
  const periodScore = period ? period.score : 0;
  if (day && toks.length <= 3 && !cls && dayScore >= periodScore) {
    return { ...base, kind: 'day', day: day.day, parseConfidence: day.score };
  }
  if (period && !subject && toks.length <= 4) {
    return { ...base, kind: 'period', period: period.period, parseConfidence: period.score };
  }
  if (cls) {
    const remainder = subject ? subject.rest : cls.rest;
    const room = extractRoom(remainder);
    return {
      ...base,
      kind: 'lesson',
      className: cls.className,
      subject: subject?.subject,
      room,
      parseConfidence: Math.min(1, cls.score * 0.85 + (subject ? 0.15 : 0.1)),
    };
  }
  if (subject) {
    return { ...base, kind: 'lesson', subject: subject.subject, parseConfidence: subject.score * 0.7 };
  }
  if (looksLikeTime(norm)) return { ...base, kind: 'other', parseConfidence: 0.9 };
  // A couple of stray letters with no digits is OCR noise from a dash or a smudge.
  if (!/[0-9]/.test(norm) && lettersOnly(norm).length <= 3) return { ...base, kind: 'empty', parseConfidence: 0.6 };
  const kind: CellKind = 'other';
  return { ...base, kind, parseConfidence: 0.3 };
}

function extractRoom(rest: string): string | undefined {
  const m = rest.match(/(غرفه|قاعه|معمل|مختبر|مصدر|فصل)\s*(\d{1,3}|[ء-ي]{1,6})?/);
  if (!m) return undefined;
  return m[0].trim();
}
