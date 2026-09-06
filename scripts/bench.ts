/**
 * Runs the extraction engine over every fixture and prints an accuracy table.
 *   npx vite-node scripts/bench.ts            (all)
 *   npx vite-node scripts/bench.ts 06          (one case)
 */
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractSchedule } from '../src/engine/pipeline';
import { createNodeOcr, loadRaster, FIXTURES, ROOT, savePng } from '../tests/helpers/node';
import { scoreLessons } from '../tests/helpers/score';

const filter = process.argv[2];
const files = readdirSync(FIXTURES).filter((f) => /\.(png|jpg)$/.test(f) && (!filter || f.startsWith(filter)));
const ocr = createNodeOcr();
await ocr.init();
const outDir = join(ROOT, 'tests', 'output');
mkdirSync(outDir, { recursive: true });
const rows: string[] = [];
for (const f of files) {
  const name = f.replace(/\.(png|jpg)$/, '');
  const expected = JSON.parse(readFileSync(join(FIXTURES, `${name}.expected.json`), 'utf8'));
  const raster = loadRaster(join(FIXTURES, f));
  const t0 = Date.now();
  const res = await extractSchedule(raster, { ocr, debug: true });
  const score = scoreLessons(expected.lessons, res.lessons);
  savePng(join(outDir, `${name}.gray.png`), res.debug!.gray);
  rows.push(
    `${name.padEnd(20)} ${res.status.padEnd(6)} acc=${(score.accuracy * 100).toFixed(0).padStart(3)}%  subj=${score.subjectCorrect}/${score.subjectExpected}  days=${res.days.length} periods=${res.periods.length} lessons=${res.lessons.length} grid=${res.grid?.rows}x${res.grid?.cols}/${res.stats.gridMethod} rot=${res.stats.rotationApplied} persp=${res.stats.perspectiveCorrected} orient=${res.orientation} q=${res.stats.quality.toFixed(2)} ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  if (process.env.VERBOSE) {
    for (const c of res.debug!.reads) if (c.text.trim()) console.log(`  [${c.row},${c.col}] conf=${c.ocrConfidence.toFixed(0)} "${c.text.replace(/\n/g, '⏎')}"`);
  }
  for (const m of score.mistakes.slice(0, 12)) console.log('   ', m);
  console.log(rows[rows.length - 1]);
}
console.log('\n=== SUMMARY ===');
console.log(rows.join('\n'));
await ocr.terminate();
