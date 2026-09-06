import type { CellRead, DayKey, ExtractedLesson, Grid, Orientation, ParsedCell } from '../types';
import { ALL_DAYS, SCHOOL_DAYS } from '../types';
import { classifyCell } from './classify';

export interface ParseOutput {
  orientation: Orientation;
  days: DayKey[];
  periods: number[];
  lessons: ExtractedLesson[];
  cells: ParsedCell[];
  warnings: string[];
  /** Number of day labels actually read from the image. */
  daysRead: number;
  /** Number of period labels actually read from the image. */
  periodsRead: number;
  /** Heuristic score used to compare orientations/rotations. */
  score: number;
}

interface AxisAssignment {
  /** Map from row/col index → day (+ whether it was read or inferred). */
  days: Map<number, { day: DayKey; inferred: boolean; confidence: number }>;
  /** Map from col/row index → period number (+ inferred flag). */
  periods: Map<number, { period: number; inferred: boolean; confidence: number }>;
  daysRead: number;
  periodsRead: number;
  headerRows: Set<number>;
  headerCols: Set<number>;
}

const dayIndex = (d: DayKey) => ALL_DAYS.indexOf(d);

/** Builds a lookup of which parsed cell covers each (row, col). */
function buildOccupancy(cells: ParsedCell[], grid: Grid): (ParsedCell | undefined)[][] {
  const occ: (ParsedCell | undefined)[][] = Array.from({ length: grid.rows }, () => new Array(grid.cols).fill(undefined));
  for (const c of cells) {
    for (let r = c.row; r < c.row + c.rowSpan && r < grid.rows; r++) {
      for (let k = c.col; k < c.col + c.colSpan && k < grid.cols; k++) occ[r][k] = c;
    }
  }
  return occ;
}

function distinctDaysInLine(line: (ParsedCell | undefined)[]): number {
  const seen = new Set<DayKey>();
  for (const c of line) if (c?.kind === 'day' && c.day) seen.add(c.day);
  return seen.size;
}

function periodsInLine(line: (ParsedCell | undefined)[]): number {
  const seen = new Set<number>();
  for (const c of line) if (c?.kind === 'period' && c.period) seen.add(c.period);
  return seen.size;
}

/** Fills gaps in a monotone sequence (e.g. periods 1,2,_,4 → 3). */
function inferSequenceGaps<T>(
  positions: number[],
  known: Map<number, { value: T; confidence: number }>,
  toNumber: (v: T) => number,
  fromNumber: (n: number) => T | null,
  step: 1 | -1,
  isData: (p: number) => boolean = () => false,
): Map<number, { value: T; inferred: boolean; confidence: number }> {
  const out = new Map<number, { value: T; inferred: boolean; confidence: number }>();
  for (const [p, v] of known) out.set(p, { value: v.value, inferred: false, confidence: v.confidence });
  const knownPositions = positions.filter((p) => known.has(p));
  if (knownPositions.length === 0) return out;
  // Extrapolate past the last / before the first label across lines that hold data
  // (a period label that the OCR missed at the end of the table).
  if (knownPositions.length >= 2) {
    const last = knownPositions[knownPositions.length - 1];
    let v = toNumber(known.get(last)!.value);
    for (const p of positions.filter((q) => q > last)) {
      if (!isData(p)) break;
      v += step;
      const val = fromNumber(v);
      if (val === null) break;
      out.set(p, { value: val, inferred: true, confidence: 0.5 });
    }
    const first = knownPositions[0];
    v = toNumber(known.get(first)!.value);
    for (const p of positions.filter((q) => q < first).reverse()) {
      if (!isData(p)) break;
      v -= step;
      const val = fromNumber(v);
      if (val === null) break;
      out.set(p, { value: val, inferred: true, confidence: 0.5 });
    }
  }
  // interior gaps
  for (let i = 0; i + 1 < knownPositions.length; i++) {
    const a = knownPositions[i];
    const b = knownPositions[i + 1];
    const va = toNumber(known.get(a)!.value);
    const vb = toNumber(known.get(b)!.value);
    const between = positions.filter((p) => p > a && p < b);
    if (between.length && Math.abs(vb - va) === between.length + 1 && Math.sign(vb - va) === step) {
      between.forEach((p, k) => {
        const v = fromNumber(va + step * (k + 1));
        if (v !== null) out.set(p, { value: v, inferred: true, confidence: 0.55 });
      });
    }
  }
  return out;
}

function assignAxes(occ: (ParsedCell | undefined)[][], grid: Grid, orientation: Orientation): AxisAssignment | null {
  const rows = grid.rows;
  const cols = grid.cols;
  // In "days-in-rows" the day labels sit in one column and periods in one row.
  const dayLineCount = orientation === 'days-in-rows' ? cols : rows;
  const periodLineCount = orientation === 'days-in-rows' ? rows : cols;
  const getDayLine = (i: number) => (orientation === 'days-in-rows' ? occ.map((r) => r[i]) : occ[i]);
  const getPeriodLine = (i: number) => (orientation === 'days-in-rows' ? occ[i] : occ.map((r) => r[i]));

  let dayLine = -1;
  let dayBest = 0;
  for (let i = 0; i < dayLineCount; i++) {
    const n = distinctDaysInLine(getDayLine(i));
    if (n > dayBest) {
      dayBest = n;
      dayLine = i;
    }
  }
  let periodLine = -1;
  let periodBest = 0;
  for (let i = 0; i < periodLineCount; i++) {
    const n = periodsInLine(getPeriodLine(i));
    if (n > periodBest) {
      periodBest = n;
      periodLine = i;
    }
  }
  if (dayBest < 2 && periodBest < 2) return null;

  const headerRows = new Set<number>();
  const headerCols = new Set<number>();
  // --- days ---
  const dayPositions = orientation === 'days-in-rows' ? [...Array(rows).keys()] : [...Array(cols).keys()];
  const knownDays = new Map<number, { value: DayKey; confidence: number }>();
  if (dayLine >= 0 && dayBest >= 2) {
    const line = getDayLine(dayLine);
    if (orientation === 'days-in-rows') headerCols.add(dayLine);
    else headerRows.add(dayLine);
    for (let p = 0; p < line.length; p++) {
      const c = line[p];
      if (c?.kind === 'day' && c.day) {
        // A label spanning several rows/cols covers all of them.
        const start = orientation === 'days-in-rows' ? c.row : c.col;
        const span = orientation === 'days-in-rows' ? c.rowSpan : c.colSpan;
        for (let k = start; k < start + span; k++) knownDays.set(k, { value: c.day, confidence: c.parseConfidence * 0.6 + c.ocrConfidence * 0.4 });
      }
    }
  }
  // --- periods ---
  const periodPositions = orientation === 'days-in-rows' ? [...Array(cols).keys()] : [...Array(rows).keys()];
  const knownPeriods = new Map<number, { value: number; confidence: number }>();
  if (periodLine >= 0 && periodBest >= 2) {
    const line = getPeriodLine(periodLine);
    if (orientation === 'days-in-rows') headerRows.add(periodLine);
    else headerCols.add(periodLine);
    for (let p = 0; p < line.length; p++) {
      const c = line[p];
      if (c?.kind === 'period' && c.period) {
        const start = orientation === 'days-in-rows' ? c.col : c.row;
        const span = orientation === 'days-in-rows' ? c.colSpan : c.rowSpan;
        for (let k = start; k < start + span; k++) knownPeriods.set(k, { value: c.period, confidence: c.parseConfidence * 0.6 + c.ocrConfidence * 0.4 });
      }
    }
  }
  // Any other line that is mostly header-ish (other/period/day cells, no lessons) above/before the data is a header too.
  const firstDataDay = Math.min(...[...knownDays.keys()], Infinity);
  const firstDataPeriod = Math.min(...[...knownPeriods.keys()], Infinity);
  if (orientation === 'days-in-rows') {
    for (let r = 0; r < Math.min(rows, Number.isFinite(firstDataDay) ? firstDataDay : 0); r++) headerRows.add(r);
    for (let c = 0; c < Math.min(cols, Number.isFinite(firstDataPeriod) ? firstDataPeriod : 0); c++) {
      if (dayLine > c) headerCols.add(c);
    }
  } else {
    for (let c = 0; c < Math.min(cols, Number.isFinite(firstDataDay) ? firstDataDay : 0); c++) headerCols.add(c);
    for (let r = 0; r < Math.min(rows, Number.isFinite(firstDataPeriod) ? firstDataPeriod : 0); r++) {
      if (dayLine > r) headerRows.add(r);
    }
  }

  // Direction of period numbering: determined by the read labels, else by RTL convention.
  const knownPeriodEntries = [...knownPeriods.entries()].sort((a, b) => a[0] - b[0]);
  let step: 1 | -1 = 1;
  if (knownPeriodEntries.length >= 2) {
    let inc = 0;
    let dec = 0;
    for (let i = 0; i + 1 < knownPeriodEntries.length; i++) {
      if (knownPeriodEntries[i + 1][1].value > knownPeriodEntries[i][1].value) inc++;
      else dec++;
    }
    step = inc >= dec ? 1 : -1;
  } else if (orientation === 'days-in-rows') {
    // RTL table: day column on the right → periods increase towards the left.
    step = dayLine >= 0 && dayLine > cols / 2 ? -1 : 1;
  }

  const lineHasLessons = (line: (ParsedCell | undefined)[]) => line.some((c) => c && (c.kind === 'lesson' || (c.kind === 'other' && c.parseConfidence < 0.5)));
  const periodIsData = (p: number) => {
    const line = orientation === 'days-in-rows' ? occ.map((r) => r[p]) : occ[p];
    if (orientation === 'days-in-rows' ? headerCols.has(p) || p === dayLine : headerRows.has(p) || p === dayLine) return false;
    return lineHasLessons(line);
  };
  const periodsAssigned = inferSequenceGaps(
    periodPositions,
    knownPeriods,
    (n) => n,
    (n) => (n >= 1 && n <= 12 ? n : null),
    step,
    periodIsData,
  );
  // When no period labels were read, number the data columns/rows positionally.
  if (knownPeriods.size < 2 && knownDays.size >= 2) {
    const dataPositions = periodPositions.filter((p) => (orientation === 'days-in-rows' ? !headerCols.has(p) && p !== dayLine : !headerRows.has(p) && p !== dayLine));
    const ordered = step === 1 ? dataPositions : [...dataPositions].reverse();
    ordered.forEach((p, i) => {
      if (!periodsAssigned.has(p)) periodsAssigned.set(p, { value: i + 1, inferred: true, confidence: 0.45 });
    });
  }

  // Day step: reading order of school days.
  const knownDayEntries = [...knownDays.entries()].sort((a, b) => a[0] - b[0]);
  let dayStep: 1 | -1 = 1;
  if (knownDayEntries.length >= 2) {
    let inc = 0;
    let dec = 0;
    for (let i = 0; i + 1 < knownDayEntries.length; i++) {
      if (dayIndex(knownDayEntries[i + 1][1].value) > dayIndex(knownDayEntries[i][1].value)) inc++;
      else dec++;
    }
    dayStep = inc >= dec ? 1 : -1;
  } else if (orientation === 'days-in-columns') {
    dayStep = periodLine >= 0 && periodLine > cols / 2 ? -1 : 1;
  }
  const dayIsData = (p: number) => {
    const line = orientation === 'days-in-rows' ? occ[p] : occ.map((r) => r[p]);
    if (orientation === 'days-in-rows' ? headerRows.has(p) || p === periodLine : headerCols.has(p) || p === periodLine) return false;
    return lineHasLessons(line);
  };
  const daysAssigned = inferSequenceGaps(
    dayPositions,
    knownDays,
    (d) => dayIndex(d),
    (n) => (n >= 0 && n < ALL_DAYS.length ? ALL_DAYS[n] : null),
    dayStep,
    dayIsData,
  );
  if (knownDays.size < 2 && knownPeriods.size >= 2) {
    const dataPositions = dayPositions.filter((p) => (orientation === 'days-in-rows' ? !headerRows.has(p) && p !== periodLine : !headerCols.has(p) && p !== periodLine));
    if (dataPositions.length === SCHOOL_DAYS.length) {
      const ordered = dayStep === 1 ? dataPositions : [...dataPositions].reverse();
      ordered.forEach((p, i) => {
        if (!daysAssigned.has(p)) daysAssigned.set(p, { value: SCHOOL_DAYS[i], inferred: true, confidence: 0.4 });
      });
    }
  }

  const days = new Map<number, { day: DayKey; inferred: boolean; confidence: number }>();
  for (const [p, v] of daysAssigned) days.set(p, { day: v.value, inferred: v.inferred, confidence: v.confidence });
  const periods = new Map<number, { period: number; inferred: boolean; confidence: number }>();
  for (const [p, v] of periodsAssigned) periods.set(p, { period: v.value, inferred: v.inferred, confidence: v.confidence });
  return { days, periods, daysRead: knownDays.size, periodsRead: knownPeriods.size, headerRows, headerCols };
}

function scoreAssignment(a: AxisAssignment | null): number {
  if (!a) return -1;
  const distinctDays = new Set([...a.days.values()].map((d) => d.day)).size;
  const distinctPeriods = new Set([...a.periods.values()].map((p) => p.period)).size;
  return a.daysRead * 2 + a.periodsRead * 1.5 + distinctDays + distinctPeriods;
}

/**
 * Stage 4 + 5 of the engine: understands which axis holds the days and which
 * holds the periods, then turns every data cell into structured lessons.
 */
export function parseSchedule(reads: CellRead[], grid: Grid): ParseOutput {
  const cells = reads.map(classifyCell);
  const occ = buildOccupancy(cells, grid);
  const warnings: string[] = [];

  const byRows = assignAxes(occ, grid, 'days-in-rows');
  const byCols = assignAxes(occ, grid, 'days-in-columns');
  const sRows = scoreAssignment(byRows);
  const sCols = scoreAssignment(byCols);
  const orientation: Orientation = sCols > sRows ? 'days-in-columns' : 'days-in-rows';
  const axes = orientation === 'days-in-rows' ? byRows : byCols;

  if (!axes) {
    return { orientation, days: [], periods: [], lessons: [], cells, warnings: ['لم يتم التعرف على الأيام أو الحصص'], daysRead: 0, periodsRead: 0, score: 0 };
  }
  if (axes.daysRead < 2) warnings.push('لم تُقرأ أسماء الأيام بوضوح، وتم استنتاج ترتيبها');
  if (axes.periodsRead < 2) warnings.push('لم تُقرأ أرقام الحصص بوضوح، وتم استنتاج ترتيبها من مواقع الأعمدة');

  // Collect data cells per (day, period).
  const slots = new Map<string, { day: DayKey; period: number; cells: ParsedCell[]; dayConf: number; periodConf: number }>();
  const visited = new Set<ParsedCell>();
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = occ[r][c];
      if (!cell || visited.has(cell)) continue;
      visited.add(cell);
      if (cell.kind === 'day' || cell.kind === 'period') continue;
      const dayPos = orientation === 'days-in-rows' ? cell.row : cell.col;
      const daySpan = orientation === 'days-in-rows' ? cell.rowSpan : cell.colSpan;
      const perPos = orientation === 'days-in-rows' ? cell.col : cell.row;
      const perSpan = orientation === 'days-in-rows' ? cell.colSpan : cell.rowSpan;
      for (let d = dayPos; d < dayPos + daySpan; d++) {
        const day = axes.days.get(d);
        if (!day) continue;
        for (let p = perPos; p < perPos + perSpan; p++) {
          const period = axes.periods.get(p);
          if (!period) continue;
          const key = `${day.day}:${period.period}`;
          let slot = slots.get(key);
          if (!slot) {
            slot = { day: day.day, period: period.period, cells: [], dayConf: day.confidence, periodConf: period.confidence };
            slots.set(key, slot);
          }
          if (!slot.cells.includes(cell)) slot.cells.push(cell);
        }
      }
    }
  }

  const lessons: ExtractedLesson[] = [];
  for (const slot of slots.values()) {
    const textCells = slot.cells.filter((c) => c.kind !== 'empty');
    if (!textCells.length) continue;
    const withClass = textCells.find((c) => c.className);
    const withSubject = textCells.find((c) => c.subject);
    const rawText = textCells
      .map((c) => c.rawText.trim())
      .filter(Boolean)
      .join('\n');
    const ocrConf = textCells.reduce((s, c) => s + c.ocrConfidence, 0) / textCells.length;
    let className = withClass?.className ?? '';
    let parseConf: number;
    if (withClass) {
      parseConf = withClass.parseConfidence;
    } else if (withSubject) {
      // subject only: still a lesson, but the class name is unknown
      className = '';
      parseConf = 0.45;
    } else {
      // unrecognised text in a data cell: keep it so the teacher can fix it
      className = textCells[0].normalizedText.replace(/\n/g, ' ').slice(0, 24);
      parseConf = 0.25;
    }
    let confidence = 0.55 * parseConf + 0.45 * ocrConf;
    // Inferred axes (e.g. periods numbered by position) are reliable when the other axis was read.
    confidence *= 0.85 + 0.15 * Math.min(slot.dayConf, slot.periodConf);
    lessons.push({
      day: slot.day,
      period: slot.period,
      className,
      subject: withSubject?.subject,
      room: textCells.find((c) => c.room)?.room,
      rawText,
      confidence: Math.max(0.05, Math.min(1, confidence)),
      source: { row: textCells[0].row, col: textCells[0].col },
    });
  }

  const days = ALL_DAYS.filter((d) => [...axes.days.values()].some((v) => v.day === d));
  const periods = [...new Set([...axes.periods.values()].map((p) => p.period))].sort((a, b) => a - b);
  lessons.sort((a, b) => dayIndex(a.day) - dayIndex(b.day) || a.period - b.period);
  const score = scoreAssignment(axes) + Math.min(lessons.length, 40) / 4;
  return { orientation, days, periods, lessons, cells, warnings, daysRead: axes.daysRead, periodsRead: axes.periodsRead, score };
}
