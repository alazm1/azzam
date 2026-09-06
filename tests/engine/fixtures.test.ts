/**
 * End-to-end engine tests: every fixture in tests/fixtures is rendered by
 * scripts/gen-fixtures.mjs (real Arabic fonts, real Chromium) and comes with
 * its ground truth. The engine must rebuild the schedule from the image.
 *
 * Accuracy = correct (day, period, class) slots / (expected + extra slots).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractSchedule } from '../../src/engine/pipeline';
import { createNodeOcr, loadRaster, FIXTURES } from '../helpers/node';
import { scoreLessons } from '../helpers/score';

/**
 * 01–08 are rendered fixtures (clean, known fonts). 09–13 are real teacher
 * photos/screenshots contributed by users; their thresholds track the
 * accuracy the engine currently reaches on them and guard against regressions.
 */
const MIN_ACCURACY: Record<string, number> = {
  '01-madrasati': 0.85,
  '02-simple-bw': 0.9,
  '03-colored': 0.85,
  '04-days-rows': 0.85,
  '05-days-cols': 0.85,
  '06-angled': 0.8,
  '07-medium-quality': 0.75,
  '08-merged-empty': 0.85,
  '09-madrasati-blue': 0.1,
  '10-printed-sections': 0.4,
  '11-screenshot-latin-digits': 0.9,
  '12-photo-asc': 0.85,
  '13-bubbles-no-lines': 0.3,
};
const SYNTHETIC = /^0[1-8]-/;

const files = readdirSync(FIXTURES).filter((f) => /\.(png|jpg)$/.test(f));
const ocr = createNodeOcr();

beforeAll(async () => {
  await ocr.init();
});

afterAll(async () => {
  await ocr.terminate();
});

describe('schedule extraction engine', () => {
  const results: Array<{ name: string; accuracy: number }> = [];

  for (const file of files) {
    const name = file.replace(/\.(png|jpg)$/, '');
    it(`${name}: rebuilds the schedule from the image`, async () => {
      const expected = JSON.parse(readFileSync(join(FIXTURES, `${name}.expected.json`), 'utf8'));
      const result = await extractSchedule(loadRaster(join(FIXTURES, file)), { ocr });
      const score = scoreLessons(expected.lessons, result.lessons);
      results.push({ name, accuracy: score.accuracy });
      // eslint-disable-next-line no-console
      console.log(`${name}: accuracy ${(score.accuracy * 100).toFixed(0)}% (${score.correct}/${score.expected}, extra ${score.extra}) orientation=${result.orientation} rot=${result.stats.rotationApplied}${score.mistakes.length ? '\n  ' + score.mistakes.join('\n  ') : ''}`);
      expect(result.status).toBe('ok');
      expect(result.orientation).toBe(expected.orientation);
      if (SYNTHETIC.test(name)) {
        expect(result.days).toEqual(['sun', 'mon', 'tue', 'wed', 'thu']);
        expect(result.periods).toEqual([1, 2, 3, 4, 5, 6, 7]);
      }
      expect(score.accuracy).toBeGreaterThanOrEqual(MIN_ACCURACY[name] ?? 0.8);
    });
  }

  it('reaches a high average accuracy across all layouts', () => {
    const synthetic = results.filter((r) => SYNTHETIC.test(r.name));
    const real = results.filter((r) => !SYNTHETIC.test(r.name));
    const avg = (rs: typeof results) => rs.reduce((s, r) => s + r.accuracy, 0) / Math.max(1, rs.length);
    // eslint-disable-next-line no-console
    console.log(`average accuracy — rendered: ${(avg(synthetic) * 100).toFixed(1)}%, real photos: ${(avg(real) * 100).toFixed(1)}%`);
    expect(avg(synthetic)).toBeGreaterThanOrEqual(0.95);
    expect(avg(real)).toBeGreaterThanOrEqual(0.5);
  });

  it('recovers an upside-down photo', async () => {
    const raster = loadRaster(join(FIXTURES, '02-simple-bw.png'));
    // rotate the raster by 180°
    const flipped = new Uint8ClampedArray(raster.data.length);
    const n = raster.width * raster.height;
    for (let i = 0; i < n; i++) {
      const j = n - 1 - i;
      flipped[j * 4] = raster.data[i * 4];
      flipped[j * 4 + 1] = raster.data[i * 4 + 1];
      flipped[j * 4 + 2] = raster.data[i * 4 + 2];
      flipped[j * 4 + 3] = raster.data[i * 4 + 3];
    }
    const result = await extractSchedule({ width: raster.width, height: raster.height, data: flipped }, { ocr });
    const expected = JSON.parse(readFileSync(join(FIXTURES, '02-simple-bw.expected.json'), 'utf8'));
    const score = scoreLessons(expected.lessons, result.lessons);
    expect(result.stats.rotationApplied).toBe(180);
    expect(score.accuracy).toBeGreaterThanOrEqual(0.85);
  });

  it('fails gracefully (Arabic message, no exception) on an image without a table', async () => {
    const w = 640;
    const h = 480;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = 200 + ((i * 7919) % 40);
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const result = await extractSchedule({ width: w, height: h, data }, { ocr });
    expect(result.status).toBe('failed');
    expect(result.message).toContain('لم نتمكن من قراءة الجدول');
  });
});
