/**
 * Browser smoke test: serves the production build, uploads a fixture through
 * the real UI (Tesseract running in the page), walks through review →
 * confirm → schedule and saves screenshots to tests/output/e2e-*.png.
 *
 *   npm run build && node scripts/e2e-smoke.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'tests', 'output');
mkdirSync(out, { recursive: true });
const fixture = process.argv[2] || '01-madrasati.png';
const port = 4173;

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 30000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('localhost')) {
      clearTimeout(t);
      resolve();
    }
  });
  server.stderr.on('data', (d) => process.stderr.write(d));
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('[browser]', m.type(), m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

try {
  await page.goto(`http://localhost:${port}/`);
  await page.getByRole('button', { name: 'رفع صورة' }).waitFor();
  await page.screenshot({ path: join(out, 'e2e-1-home.png') });

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'رفع صورة' }).click()]);
  await chooser.setFiles(join(root, 'tests', 'fixtures', fixture));

  await page.getByText('جارٍ تحليل الجدول').waitFor();
  await page.screenshot({ path: join(out, 'e2e-2-analyzing.png') });
  const t0 = Date.now();
  await page.getByRole('heading', { name: 'راجع جدولك قبل الحفظ' }).waitFor({ timeout: 180000 });
  console.log(`analysis finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.screenshot({ path: join(out, 'e2e-3-review.png'), fullPage: true });

  // edit one cell through the sheet
  await page.getByRole('button', { name: /الأحد الحصة ١/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: join(out, 'e2e-4-sheet.png') });
  await page.getByLabel('الفصل / الشعبة').fill('٢/ج');
  await page.getByRole('button', { name: 'حفظ' }).click();

  await page.getByRole('button', { name: 'اعتماد الجدول' }).click();
  await page.getByRole('heading', { name: 'جدولي الأسبوعي' }).waitFor();
  await page.screenshot({ path: join(out, 'e2e-5-schedule.png'), fullPage: true });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jadwal-almuallim:schedule:v1') || 'null'));
  console.log('saved lessons:', saved?.lessons?.length, 'periods:', saved?.periods?.join(','), 'first:', JSON.stringify(saved?.lessons?.[0]));

  await page.getByRole('button', { name: 'اليوم' }).click();
  await page.screenshot({ path: join(out, 'e2e-6-today.png'), fullPage: true });
  await page.getByRole('button', { name: 'الإعدادات' }).click();
  await page.screenshot({ path: join(out, 'e2e-7-settings.png'), fullPage: true });

  // reload → schedule persisted
  await page.reload();
  await page.getByRole('heading', { name: 'جدولي الأسبوعي' }).waitFor();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log('page horizontal overflow:', horizontalOverflow);
  console.log('E2E OK');
} catch (err) {
  console.error('E2E FAILED', err);
  await page.screenshot({ path: join(out, 'e2e-error.png'), fullPage: true });
  process.exitCode = 1;
} finally {
  await browser.close();
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
}
