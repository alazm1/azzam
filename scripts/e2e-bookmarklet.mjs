/**
 * Simulates the "زر جدولي" flow: a fake Madrasati page runs the bookmarklet
 * code, which opens the app with the captured table; the review dialog must
 * show the lessons. Run after `npm run build`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = 4174;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview did not start')), 30000);
  server.stdout.on('data', (d) => String(d).includes('localhost') && (clearTimeout(t), resolve()));
});
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
try {
  // 1. get the bookmarklet code from the app itself
  await page.goto(`http://localhost:${port}/`);
  const code = await page.evaluate(() => {
    const a = document.getElementById('jadwali-bookmarklet');
    return a ? a.getAttribute('href') : null;
  });
  if (!code) throw new Error('bookmarklet link not found');
  console.log('bookmarklet length:', code.length);
  // 2. open the fake Madrasati page and run the bookmarklet there
  await page.goto(pathToFileURL(join(root, 'tests', 'output', 'fake-madrasati.html')).href);
  await page.evaluate((js) => {
    // eslint-disable-next-line no-eval
    (0, eval)(decodeURIComponent(js.replace(/^javascript:/, '')));
  }, code);
  // 3. the app should open with the schedule in review
  await page.waitForURL((u) => u.hostname === 'localhost', { timeout: 15000 });
  await page.getByRole('heading', { name: 'مراجعة الجدول المقروء' }).waitFor({ timeout: 15000 });
  const cells = await page.$$eval('dialog[open] table tbody button b', (els) => els.map((e) => e.textContent));
  console.log('review cells:', cells.length, cells.slice(0, 6).join(' | '));
  await page.screenshot({ path: join(root, 'tests', 'output', 'e2e-bookmarklet.png'), fullPage: true });
  console.log(cells.length >= 20 ? 'BOOKMARKLET OK' : 'BOOKMARKLET TOO FEW CELLS');
  process.exitCode = cells.length >= 20 ? 0 : 1;
  // 4. paste flow: simulate pasting the page HTML into the paste box
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const html = readFileSync(join(root, 'tests', 'output', 'fake-madrasati.html'), 'utf8');
  await page.locator('summary', { hasText: 'مدرستي' }).click();
  await page.locator('#madrasati-paste').evaluate((el, h) => {
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    dt.setData('text/plain', 'x');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, html);
  await page.getByRole('heading', { name: 'مراجعة الجدول المقروء' }).waitFor({ timeout: 15000 });
  const pasteCells = await page.$$eval('dialog[open] table tbody button b', (els) => els.length);
  console.log('paste flow cells:', pasteCells, pasteCells >= 20 ? 'PASTE OK' : 'PASTE FAILED');
  if (pasteCells < 20) process.exitCode = 1;
} catch (e) {
  console.error('BOOKMARKLET FAILED', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
}
