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
  // Multi-line headers ("٣" over "10:00 - 10:45"): a line that is a period on its own decides.
  const lines = norm.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    for (const line of lines) {
      const m = matchPeriodLine(line);
      if (m) return m;
    }
    return null;
  }
  return matchPeriodLine(norm);
}

function matchPeriodLine(norm: string): PeriodMatch | null {
  let s = norm.replace(/\n/g, ' ');
  s = s.replace(TIME_RE, ' ').replace(/\b(am|pm|ص|م)\b/g, ' ');
  const toks = tokens(s)
    .map((t) => t.replace(/^ح(?=\d)/, '').replace(/(?<=\d)ح$/, '')) // "ح5" / "5ح"
    .map((t) => (/^(?:ال)?ل?حصه./.test(lettersOnly(t)) ? t.replace(/^(?:ال)?ل?حصه/, '') : t)) // "الحصةالثالثة" glued
    .filter((t) => !PERIOD_WORDS.includes(lettersOnly(t)) && lettersOnly(t) !== 'ح');
  if (!toks.length) return null;
  // An ordinal word decides even when OCR noise adds a stray digit ("1 الحصة السابعة").
  let ordinal: PeriodMatch | null = null;
  for (const t of toks) {
    const letters = lettersOnly(t);
    if (letters.length < 4) continue;
    const m = bestMatch(letters, PERIOD_ORDINALS, 0.72);
    if (m && (!ordinal || m.score > ordinal.score)) ordinal = { period: m.key, score: m.score };
  }
  if (ordinal && toks.length <= 4) return ordinal;
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
export function parseClassName(norm: string, allowBareGrade = false): ClassMatch | null {
  const s = norm.replace(/\n/g, ' ');
  // Worded forms ("ثاني متوسط أ") take priority when a stage word is present:
  // a stray digit/letter fragment elsewhere in the cell must not win.
  if (/متوسط|ابتدائ|ثانوي|صف/.test(s)) {
    const worded = parseWordedClass(s);
    if (worded) return worded;
  }
  // Digit patterns must sit on one line: "6" over "-ا" is a period number plus noise, not a class.
  const lines = norm.split('\n').map((l) => l.trim()).filter(Boolean);
  let best: ClassMatch | null = null;
  if (lines.length > 1) {
    for (let i = 0; i < lines.length; i++) {
      const m = parseDigitClass(lines[i]);
      if (m && (!best || m.score > best.score)) best = { ...m, rest: [...lines.slice(0, i), m.rest, ...lines.slice(i + 1)].join(' ') };
    }
  } else {
    best = parseDigitClass(s);
  }
  // A worded form ("ثاني/3") outranks a weak glued fragment ("ه٥") read from a noisy line.
  const worded = parseWordedClass(s, allowBareGrade);
  if (worded && (!best || worded.score > best.score)) return worded;
  return best;
}

/** Digit-based class forms on a single line: ٢/أ, أ/٢, 3/1, 2ب. */
function parseDigitClass(s: string): ClassMatch | null {
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
      return { className: `${toArabicDigits(grade)}/${sectionDisplay(letter)}`, score: 0.65, rest: s.replace(m[0], ' ') };
    }
  }
  return null;
}

/** Worded class names: [الصف] <ordinal> [stage] [section]. */
function parseWordedClass(s: string, allowBareGrade = false): ClassMatch | null {
  const toks = tokens(s);
  for (let i = 0; i < toks.length; i++) {
    const t = lettersOnly(toks[i]);
    if (!t) continue;
    const g = bestMatch(t, GRADE_WORDS, 0.8);
    if (!g) continue;
    const prevIsSaf = i > 0 && /^(ال)?صف$/.test(lettersOnly(toks[i - 1]));
    // "ثاني1": the section digit glued to the grade word
    const gluedDigit = toks[i].match(/^[ء-ي]+(\d{1,2})$/);
    if (gluedDigit && !t.startsWith('ال')) {
      const rest = [...toks.slice(0, prevIsSaf ? i - 1 : i), ...toks.slice(i + 1)].join(' ');
      return { className: wordedClassName(GRADE_NAMES_AR[g.key], null, toArabicDigits(gluedDigit[1])), score: 0.9, rest };
    }
    let stage: string | null = null;
    let section: string | null = null;
    let consumed = 1;
    // Ordinal forms ("الثانية") are period labels: only a bare grade word ("ثاني") takes a numeric section.
    const bareGrade = !t.startsWith('ال') && !t.endsWith('ه');
    const st = matchStage(toks[i + 1] ? lettersOnly(toks[i + 1]) : '', toks[i + 2] ? lettersOnly(toks[i + 2]) : '', toks[i + 1] ?? '');
    // "ثاني/1", "ثاني 1" → a small number right after a bare grade word is the section.
    if (!st && bareGrade && toks[i + 1] && /^\d{1,2}$/.test(toks[i + 1]) && Number(toks[i + 1]) <= 20 && !/^\d{1,2}\s*[:.]\d/.test(s.slice(s.indexOf(toks[i + 1])))) {
      const rest = [...toks.slice(0, prevIsSaf ? i - 1 : i), ...toks.slice(i + 2)].join(' ');
      return { className: wordedClassName(GRADE_NAMES_AR[g.key], null, toArabicDigits(toks[i + 1])), score: 0.95, rest };
    }
    if (st) {
      stage = st.stage;
      section = st.section;
      consumed = 1 + st.consumed;
    }
    const after = !section && toks[i + consumed] ? toks[i + consumed] : '';
    if (after && after.length === 1 && SECTION_CLASS.includes(after)) {
      section = sectionDisplay(after);
      consumed++;
    } else if (after && /^\d{1,2}$/.test(after) && Number(after) <= 20 && (stage || bareGrade)) {
      section = toArabicDigits(after);
      consumed++;
    }
    if (!stage && !section && !prevIsSaf) {
      // "ثاني" alone next to a subject line is a class (grade only); on its own it is a period ordinal.
      if (!allowBareGrade) continue;
      const restBare = [...toks.slice(0, i), ...toks.slice(i + 1)].join(' ');
      return { className: GRADE_NAMES_AR[g.key], score: 0.6, rest: restBare };
    }
    const rest = [...toks.slice(0, prevIsSaf ? i - 1 : i), ...toks.slice(i + consumed)].join(' ');
    return { className: wordedClassName(GRADE_NAMES_AR[g.key], stage, section), score: stage || section ? 0.95 : 0.75, rest };
  }
  // Grade word garbled by OCR but a stage word survived: "0 ني متوسط أ" → ثاني متوسط أ
  for (let i = 1; i < toks.length; i++) {
    const st = matchStage(lettersOnly(toks[i]), toks[i + 1] ? lettersOnly(toks[i + 1]) : '', toks[i]);
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
    } else if (!section && /^\d{1,2}$/.test(after) && Number(after) <= 20) {
      section = toArabicDigits(after);
      consumed++;
    }
    const rest = [...toks.slice(0, gradeIdx), ...toks.slice(consumed)].join(' ');
    return { className: wordedClassName(GRADE_NAMES_AR[g.key], st.stage, section), score: 0.6, rest };
  }
  return null;
}

/** "ثاني متوسط أ" for letter sections, "ثاني/١" or "ثالث ابتدائي/١" for numeric ones. */
function wordedClassName(grade: string, stage: string | null, section: string | null): string {
  const head = stage ? `${grade} ${stage}` : grade;
  if (!section) return head;
  return /^[٠-٩0-9]+$/.test(section) ? `${head}/${section}` : `${head} ${section}`;
}

const LONG_STAGES: Array<[string, string[]]> = STAGE_WORDS.map(([k, v]) => [k, v.filter((x) => x.length > 1)]);

/**
 * Matches a stage word ("متوسط") possibly with the section letter glued to
 * it ("متوسطأ") or split across two tokens ("متو" + "سطب").
 */
function matchStage(tok: string, nextTok: string, rawTok = ''): { stage: string; section: string | null; consumed: number } | null {
  const tryOne = (t: string, consumed: number) => {
    if (t.length < 2) return null;
    // digits glued to the stage word: "ابتدائي1"
    const glued = rawTok.match(/^([ء-ي]+)(\d{1,2})$/);
    if (consumed === 1 && glued) {
      const st = bestMatch(glued[1], LONG_STAGES, 0.75);
      if (st) return { stage: st.key, section: toArabicDigits(glued[2]), consumed };
    }
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

/** First clock time in the text as minutes since midnight (24h; "ص"/"م" respected). */
export function firstTime(norm: string): number | undefined {
  const m = norm.match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*(ص|م|am|pm)?/);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  const suffix = m[3];
  if ((suffix === 'م' || suffix === 'pm') && h < 12) h += 12;
  // school mornings: an unmarked 1–5 o'clock is afternoon
  if (!suffix && h >= 1 && h <= 5) h += 12;
  return h * 60 + min;
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

  const cleaned = stripNoise(norm);
  const toks = tokens(cleaned.replace(/\n/g, ' '));
  const waiting = matchWaiting(cleaned);
  if (waiting) return { ...base, kind: 'lesson', className: waiting, parseConfidence: 0.9 };
  let cls = parseClassName(cleaned);
  let subject = matchSubject(cls ? cls.rest : cleaned);
  if (!cls && subject && cleaned.includes('\n')) {
    // multi-line cell with a subject: a lone grade word on another line is the class
    cls = parseClassName(subject.rest, true);
    if (cls) subject = matchSubject(cls.rest) ?? subject;
  }
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
  // Card layouts leave outline fragments around the label ("د٣ / الأحد1 / غغ"): a clear day
  // name among short junk tokens is still a day.
  if (day && dayScore >= 0.85 && toks.filter((t) => lettersOnly(t).length >= 3).length <= 1 && !subject) {
    return { ...base, kind: 'day', day: day.day, parseConfidence: day.score * 0.9 };
  }
  if (period && !subject && toks.length <= 4) {
    return { ...base, kind: 'period', period: period.period, parseConfidence: period.score, timeMinutes: firstTime(norm) };
  }
  if (cls) {
    const remainder = subject ? subject.rest : cls.rest;
    const room = extractRoom(remainder);
    // No known subject: keep the remaining words (a lesson title such as
    // "حل أنظمة المتباينات") so the teacher sees what was written.
    const fallback = !subject ? leftoverSubject(remainder, rawText) : undefined;
    return {
      ...base,
      kind: 'lesson',
      className: cls.className,
      subject: subject?.subject ?? fallback,
      room,
      parseConfidence: Math.min(1, cls.score * 0.85 + (subject ? 0.15 : 0.1)),
    };
  }
  if (subject) {
    return { ...base, kind: 'lesson', subject: subject.subject, parseConfidence: subject.score * 0.7 };
  }
  const time = firstTime(norm);
  if (looksLikeTime(norm)) return { ...base, kind: 'other', parseConfidence: 0.9, timeMinutes: time };
  // A couple of stray letters with no digits is OCR noise from a dash or a smudge.
  if (!/[0-9]/.test(norm) && lettersOnly(norm).length <= 3) return { ...base, kind: 'empty', parseConfidence: 0.6 };
  // Unreadable scribble (very low OCR confidence, nothing recognised) is treated as empty.
  if (ocrConfidence < 0.45 && !/\d/.test(norm)) return { ...base, kind: 'empty', parseConfidence: 0.4 };
  const kind: CellKind = 'other';
  return { ...base, kind, parseConfidence: 0.3, timeMinutes: time };
}

/** Words that appear in exported schedules but carry no schedule information. */
const NOISE_WORDS = ['محضره', 'محضرة', 'طباعه', 'طباعة', 'وتنزيل', 'تنزيل', 'عرض', 'تفاصيل', 'اعداد', 'إعداد', 'دخول', 'حضور', 'رابط', 'تحضير', 'غير محضره'];
const TIME_RANGE = /\b\d{1,2}\s*[:.]\s*\d{2}\s*(?:[صم]|am|pm)?\s*(?:-\s*\d{1,2}\s*[:.]\s*\d{2}\s*(?:[صم]|am|pm)?)?/g;

/** Removes times, print/attendance buttons and similar decorations from a cell. */
export function stripNoise(norm: string): string {
  return norm
    .split('\n')
    .map((line) => {
      let l = line.replace(TIME_RANGE, ' ').replace(/[()«»]/g, ' ');
      const toks = l.split(/\s+/).filter((t) => t && !NOISE_WORDS.includes(lettersOnly(t)) && !NOISE_WORDS.includes(t));
      l = toks.join(' ').trim();
      return /^[\s\-–—.·]*$/.test(l) ? '' : l;
    })
    .filter(Boolean)
    .join('\n');
}

/** "منتظر ١" / "انتظار" — standby periods are real slots in Saudi timetables. */
export function matchWaiting(norm: string): string | undefined {
  const flat = norm.replace(/\n/g, ' ').trim();
  const m = flat.match(/^(?:حصه\s*)?([ء-ي]{3,8})\s*(\d{1,2})?$/);
  if (!m) return undefined;
  const word = lettersOnly(m[1]);
  const known = ['منتظر', 'انتظار', 'الانتظار', 'احتياط', 'مناوبه', 'نتظر', 'نتظ', 'نتض', 'متظر'];
  const best = Math.max(...known.map((k) => similarity(word, k)));
  if (best < (m[2] ? 0.5 : 0.6)) return undefined;
  return m[2] ? `منتظر ${toArabicDigits(m[2])}` : 'انتظار';
}

/** Leftover words of a cell used as the subject when no known subject matched. */
function leftoverSubject(rest: string, rawText: string): string | undefined {
  const words = tokens(rest.replace(/\n/g, ' ')).filter((t) => lettersOnly(t).length >= 2 || /^\d+$/.test(t));
  if (!words.length) return undefined;
  const letters = words.map(lettersOnly).join('').length;
  if (letters < 3) return undefined;
  // Prefer the original spelling from the raw text when the line can be found.
  const rawLines = rawText.split('\n').map((l) => l.trim());
  const candidate = rawLines.find((l) => {
    const n = stripNoise(normalizeArabic(l));
    return n && words.every((w) => n.includes(w));
  });
  const value = (candidate ?? words.join(' ')).replace(TIME_RANGE, '').trim();
  return value.length > 60 ? value.slice(0, 60) : value;
}

function extractRoom(rest: string): string | undefined {
  const m = rest.match(/(غرفه|قاعه|معمل|مختبر|مصدر|فصل)\s*(\d{1,3}|[ء-ي]{1,6})?/);
  if (!m) return undefined;
  return m[0].trim();
}
