import { join } from 'node:path';
import { extractSchedule } from '../src/engine/pipeline';
import { parseSchedule } from '../src/engine/parse/scheduleParser';
import { classifyCell } from '../src/engine/parse/classify';
import { createNodeOcr, loadRaster, FIXTURES } from '../tests/helpers/node';
const ocr = createNodeOcr();
const res = await extractSchedule(loadRaster(join(FIXTURES, process.argv[2])), { ocr, debug: true, tryRotations: false });
const { reads, grid } = res.debug!;
for (const r of reads) {
  const c = classifyCell(r);
  if (c.kind !== 'empty') console.log(`[${r.row},${r.col}]${r.rowSpan > 1 || r.colSpan > 1 ? ` span ${r.rowSpan}x${r.colSpan}` : ''} ${c.kind} day=${c.day ?? ''} period=${c.period ?? ''} cls=${c.className ?? ''} subj=${c.subject ?? ''} raw="${r.text.replace(/\n/g, '⏎')}"`);
}
const p = parseSchedule(reads, grid!);
console.log('orientation', p.orientation, 'days', p.days, 'periods', p.periods, 'daysRead', p.daysRead, 'periodsRead', p.periodsRead, 'score', p.score);
console.log(p.lessons.map((l) => `${l.day}:${l.period}=${l.className}(${l.confidence.toFixed(2)})`).join('  '));
await ocr.terminate();
