/**
 * Import from a captured HTML table (the "زر جدولي" bookmarklet runs inside
 * the teacher's own Madrasati session and hands us the table cells as text).
 * The same day/period/class understanding as the image engine is applied to
 * the text matrix, so any table layout works: days in rows or in columns.
 */
import { parseSchedule } from '../engine/parse/scheduleParser';
import { validateSchedule } from '../engine/parse/scheduleValidator';
import type { CellRead, ExtractionResult, Grid } from '../engine/types';

export interface CapturedTable {
  /** rows × cols of cell text; merged cells are repeated into every slot they cover. */
  cells: string[][];
}

export interface CapturedPayload {
  v: 1;
  source: string;
  url?: string;
  tables: CapturedTable[];
}

/** UTF-8 safe base64url decode of the payload placed in the URL hash. */
export function decodePayload(b64: string): CapturedPayload | null {
  try {
    const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '='));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as CapturedPayload;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.tables)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Turns a text matrix into the engine's cell/grid representation. */
function matrixToReads(cells: string[][]): { reads: CellRead[]; grid: Grid } {
  const rows = cells.length;
  const cols = Math.max(...cells.map((r) => r.length), 0);
  const size = 100;
  const rowLines = Array.from({ length: rows + 1 }, (_, i) => i * size);
  const colLines = Array.from({ length: cols + 1 }, (_, i) => i * size);
  const reads: CellRead[] = [];
  const seen = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const text = (cells[r][c] ?? '').trim();
      // merged cells were expanded by the bookmarklet: collapse identical neighbours back into spans
      if (seen.has(`${r}:${c}`)) continue;
      let colSpan = 1;
      while (c + colSpan < cols && text && cells[r][c + colSpan] === cells[r][c] && text.length > 2) colSpan++;
      let rowSpan = 1;
      while (r + rowSpan < rows && text && cells[r + rowSpan][c] === cells[r][c] && text.length > 2 && colSpan === 1) rowSpan++;
      for (let rr = r; rr < r + rowSpan; rr++) for (let cc = c; cc < c + colSpan; cc++) seen.add(`${rr}:${cc}`);
      reads.push({ row: r, col: c, rowSpan, colSpan, x: c * size, y: r * size, w: colSpan * size, h: rowSpan * size, text, ocrConfidence: text ? 100 : 100 });
    }
  }
  const grid: Grid = { rows, cols, rowLines, colLines, cells: reads.map(({ text: _t, ocrConfidence: _c, ...box }) => box), method: 'lines' };
  return { reads, grid };
}

/** Parses every captured table and keeps the one that yields the best schedule. */
export function importCapturedTables(payload: CapturedPayload): ExtractionResult {
  const started = Date.now();
  let best: ReturnType<typeof parseSchedule> | null = null;
  let bestGrid: Grid | null = null;
  for (const table of payload.tables) {
    if (!table.cells?.length || table.cells.length > 80) continue;
    const { reads, grid } = matrixToReads(table.cells);
    // Web tables are RTL: column 0 in DOM order is the rightmost on screen, which is
    // what the image engine expects (it reads the day column on the right).
    const parsed = parseSchedule(reads, grid);
    if (!best || parsed.score > best.score) {
      best = parsed;
      bestGrid = grid;
    }
  }
  if (!best) {
    return {
      status: 'failed',
      message: 'لم نجد جدولًا في الصفحة. افتح صفحة الجدول الدراسي في مدرستي ثم اضغط زر «جدولي».',
      orientation: 'days-in-rows',
      days: [],
      periods: [],
      lessons: [],
      cells: [],
      grid: null,
      warnings: [],
      stats: emptyStats(started),
    };
  }
  const validation = validateSchedule(best.lessons, best.days.length, best.periods.length);
  const lessons = validation.lessons.map((l) => ({ ...l, confidence: Math.max(l.confidence, 0.85) }));
  return {
    status: validation.ok ? 'ok' : 'failed',
    message: validation.ok ? undefined : 'ظهر جدول في الصفحة لكن لم نتعرف على أيامه وحصصه. تأكد أنك في صفحة الجدول الدراسي.',
    orientation: best.orientation,
    days: best.days,
    periods: best.periods,
    lessons,
    cells: best.cells,
    grid: bestGrid,
    warnings: [...best.warnings, ...validation.warnings],
    stats: { ...emptyStats(started), cellsTotal: best.cells.length, cellsWithText: best.cells.filter((c) => c.kind !== 'empty').length, daysDetected: best.days.length, periodsDetected: best.periods.length, lessonsDetected: lessons.length, quality: validation.quality },
  };
}

function emptyStats(started: number): ExtractionResult['stats'] {
  return {
    cellsTotal: 0,
    cellsWithText: 0,
    daysDetected: 0,
    periodsDetected: 0,
    lessonsDetected: 0,
    lowConfidence: 0,
    mediumConfidence: 0,
    quality: 0,
    durationMs: Date.now() - started,
    rotationApplied: 0,
    gridMethod: 'lines',
    perspectiveCorrected: false,
  };
}

/**
 * The bookmarklet source. It runs inside the Madrasati page (the teacher's own
 * logged-in session), collects every table as text, and opens the app with the
 * data in the URL hash. No credentials are involved and nothing is sent to a server.
 */
export function bookmarkletSource(appUrl: string): string {
  const code = `
(function(){
  var T=[];
  var tables=document.querySelectorAll('table');
  for(var i=0;i<tables.length&&i<12;i++){
    var t=tables[i],m=[],rows=t.rows;if(rows.length>80)continue;
    for(var r=0;r<rows.length;r++){m[r]=m[r]||[];var ci=0;
      for(var k=0;k<rows[r].cells.length;k++){var cell=rows[r].cells[k];while(m[r][ci]!==undefined)ci++;
        var cp=cell.cloneNode(true);var junk=cp.querySelectorAll('script,style,button,input,select,svg,i');for(var j=0;j<junk.length;j++)junk[j].remove();
        var brs=cp.querySelectorAll('br,p,div,li');for(j=0;j<brs.length;j++)brs[j].appendChild(document.createTextNode('\\n'));
        var tx=(cp.innerText||cp.textContent||'').replace(/[ \\t]+/g,' ').replace(/\\n\\s*\\n+/g,'\\n').trim().slice(0,300);
        var rs=Math.min(cell.rowSpan||1,20),cs=Math.min(cell.colSpan||1,20);
        for(var rr=r;rr<r+rs;rr++){m[rr]=m[rr]||[];for(var cc=ci;cc<ci+cs;cc++)m[rr][cc]=tx;}ci+=cs;}}
    var full=[];for(r=0;r<m.length;r++){var row=[];for(var c=0;c<m[r].length;c++)row.push(m[r][c]||'');full.push(row);}
    if(full.length>=3)T.push({cells:full});
  }
  if(!T.length){alert('لم نجد جدولًا في هذه الصفحة. افتح صفحة الجدول الدراسي أولًا.');return;}
  var json=JSON.stringify({v:1,source:location.hostname,url:location.href.split('?')[0],tables:T});
  var bytes=new TextEncoder().encode(json),bin='';for(var b=0;b<bytes.length;b++)bin+=String.fromCharCode(bytes[b]);
  var b64=btoa(bin).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
  location.href='${appUrl}#madrasati='+b64;
})();`;
  return 'javascript:' + encodeURIComponent(code.replace(/\s*\n\s*/g, ''));
}
