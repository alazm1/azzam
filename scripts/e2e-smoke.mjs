/**
 * Browser smoke test: serves the production build, uploads a fixture through
 * the real UI (Tesseract running in the page), reviews, applies, exports the
 * wallpaper and saves screenshots to tests/output/e2e-*.png.
 *
 *   npm run build && node scripts/e2e-smoke.mjs [fixture]
 */
import { writeFileSync } from 'node:fs';
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
  await page.getByRole('button', { name: 'تصوير الجدول أو اختيار صورة' }).waitFor();
  await page.screenshot({ path: join(out, 'e2e-1-home.png'), fullPage: true });

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'تصوير الجدول أو اختيار صورة' }).click()]);
  await chooser.setFiles(join(root, 'tests', 'fixtures', fixture));
  const t0 = Date.now();
  await page.getByRole('heading', { name: 'مراجعة الجدول المقروء' }).waitFor({ timeout: 180000 });
  console.log(`analysis finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.screenshot({ path: join(out, 'e2e-2-review.png'), fullPage: true });

  // edit one cell then apply
  await page.getByRole('button', { name: /الأحد، الحصة الأولى/ }).click();
  await page.getByRole('combobox', { name: 'الفصل' }).fill('٢/ج');
  await page.screenshot({ path: join(out, 'e2e-3-cell.png'), fullPage: true });
  await page.getByRole('button', { name: 'اعتماد الجدول' }).click();
  await page.getByText('تمت مراجعته').waitFor();
  await page.screenshot({ path: join(out, 'e2e-4-preview.png'), fullPage: true });

  // night theme + export
  await page.getByText('ليلي', { exact: true }).click();
  await page.getByRole('button', { name: /حفظ الصورة/ }).click();
  await page.getByRole('heading', { name: 'صورتك جاهزة' }).waitFor();
  await page.screenshot({ path: join(out, 'e2e-5-export.png'), fullPage: true });
  const png = await page.evaluate(async () => {
    const img = document.querySelector('dialog[open] img');
    const res = await fetch(img.src);
    const blob = await res.blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    return { size: blob.size, type: blob.type, b64: btoa(Array.from(buf, (b) => String.fromCharCode(b)).join('')) };
  });
  writeFileSync(join(out, 'e2e-wallpaper.png'), Buffer.from(png.b64, 'base64'));
  console.log('exported png:', { size: png.size, type: png.type });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jadwal-almuallim:design:v1') || 'null'));
  console.log('saved: source=', saved?.source, 'periods=', saved?.grid?.length, 'lessons=', saved?.grid?.flat().filter((c) => c.classroom || c.subject).length, 'theme=', saved?.theme);

  await page.reload();
  await page.getByText('تمت مراجعته').waitFor();
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
