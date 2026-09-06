/**
 * Smart-reader flows against the production build with a mocked Worker:
 *   1) the Worker answers → the review dialog shows the model's lessons;
 *   2) the Worker fails → the on-device engine takes over transparently.
 * Run after `npm run build`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = 4176;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview did not start')), 30000);
  server.stdout.on('data', (d) => String(d).includes('localhost') && (clearTimeout(t), resolve()));
});
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const WORKER = 'https://reader.example.workers.dev/';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu'];
const lessons = [];
for (let d = 0; d < 5; d++) for (let p = 1; p <= 7; p++) if ((d + p) % 2 === 0) lessons.push({ day: DAYS[d], period: p, className: `${p}/${['أ', 'ب'][d % 2]}`, subject: 'رياضيات' });
let workerMode = 'ok';
let workerCalls = 0;
await page.route('**/smart-reader.json', (route) => route.fulfill({ json: { url: WORKER } }));
await page.route(WORKER, (route) => {
  workerCalls++;
  if (workerMode === 'ok') return route.fulfill({ json: { ok: true, model: 'mock', periodsCount: 7, lessons } });
  return route.fulfill({ status: 500, json: { error: 'upstream-error' } });
});
try {
  await page.goto(`http://localhost:${port}/`);
  await page.getByLabel('القراءة الذكية (أدق، عبر الإنترنت)').waitFor();
  const upload = async (fixture) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'تصوير الجدول أو اختيار صورة' }).click()]);
    await chooser.setFiles(join(root, 'tests', 'fixtures', fixture));
    await page.getByRole('heading', { name: 'مراجعة الجدول المقروء' }).waitFor({ timeout: 180000 });
    const cells = await page.$$eval('dialog[open] table tbody button b', (els) => els.map((e) => e.textContent));
    await page.getByRole('button', { name: 'إلغاء' }).click();
    return cells;
  };
  // 1) smart path
  const t0 = Date.now();
  const smartCells = await upload('02-simple-bw.png');
  console.log(`smart path: ${smartCells.length} lessons in ${((Date.now() - t0) / 1000).toFixed(1)}s, worker calls ${workerCalls}, sample ${smartCells.slice(0, 3).join(' | ')}`);
  const smartOk = workerCalls === 1 && smartCells.length === lessons.length && smartCells.includes('١/ب');
  // 2) fallback path
  workerMode = 'fail';
  const t1 = Date.now();
  const localCells = await upload('02-simple-bw.png');
  console.log(`fallback path: ${localCells.length} lessons in ${((Date.now() - t1) / 1000).toFixed(1)}s, worker calls ${workerCalls}`);
  const localOk = workerCalls === 2 && localCells.length >= 22;
  // 3) toggle off → no worker call
  await page.locator('#smart-reader').evaluate((el) => el.click());
  await page.waitForTimeout(200);
  const offCells = await upload('02-simple-bw.png');
  console.log(`disabled path: ${offCells.length} lessons, worker calls ${workerCalls}`);
  const offOk = workerCalls === 2 && offCells.length >= 22;
  console.log(smartOk && localOk && offOk ? 'SMART E2E OK' : `SMART E2E FAILED smart=${smartOk} fallback=${localOk} off=${offOk}`);
  process.exitCode = smartOk && localOk && offOk ? 0 : 1;
} catch (e) {
  console.error('SMART E2E FAILED', e);
  await page.screenshot({ path: join(root, 'tests', 'output', 'e2e-smart-error.png'), fullPage: true });
  process.exitCode = 1;
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
}
