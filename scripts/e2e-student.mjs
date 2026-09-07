/**
 * University edition against the production build with a mocked Worker:
 * upload → review dialog lists the lectures → apply → export PNG.
 * Saves tests/output/e2e-student-*.png. Run after `npm run build`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'tests', 'output');
mkdirSync(out, { recursive: true });
const port = 4177;
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
// الجدول الأول الذي أرسله المستخدم (جدول الطالب 1448/1449)
const lectures = [
  { day: 'sun', start: '10:00', end: '11:50', course: '101 فجب' },
  { day: 'sun', start: '13:00', end: '14:50', course: '109 انجل' },
  { day: 'mon', start: '08:00', end: '09:50', course: '101 تقن' },
  { day: 'mon', start: '10:00', end: '11:50', course: '101 نهج' },
  { day: 'mon', start: '13:00', end: '14:50', course: '109 انجل' },
  { day: 'tue', start: '08:00', end: '09:50', course: '109 احص' },
  { day: 'tue', start: '10:00', end: '11:50', course: '109 احص' },
  { day: 'tue', start: '14:00', end: '15:50', course: '109 انجل' },
  { day: 'wed', start: '08:00', end: '09:50', course: '101 تقن' },
  { day: 'wed', start: '11:00', end: '11:50', course: '101 نهج' },
  { day: 'wed', start: '13:00', end: '14:50', course: '109 انجل', room: 'قاعة 12' },
];
let mode = 'ok';
let calls = 0;
await page.route('**/smart-reader.json', (route) => route.fulfill({ json: { url: WORKER } }));
await page.route(WORKER, (route) => {
  calls++;
  const body = route.request().postDataJSON();
  if (body?.mode !== 'university') return route.fulfill({ json: { ok: true, lessons: [] } });
  if (mode === 'ok') return route.fulfill({ json: { ok: true, model: 'mock', lectures, notes: '' } });
  return route.fulfill({ status: 503, json: { error: 'upstream-error' } });
});
try {
  await page.goto(`http://localhost:${port}/student/`);
  await page.getByRole('heading', { name: 'جدولي الجامعي' }).waitFor();
  await page.getByLabel('القراءة الذكية').waitFor();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'تصوير الجدول أو اختيار صورة' }).click()]);
  await chooser.setFiles(join(root, 'tests', 'fixtures', '02-simple-bw.png'));
  await page.getByRole('heading', { name: 'مراجعة الجدول المقروء' }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: join(out, 'e2e-student-review.png'), fullPage: true });
  const items = await page.$$eval('dialog[open] li b', (els) => els.map((e) => e.textContent));
  console.log(`review: ${items.length} lectures, worker calls ${calls}`);
  // تعديل: إضافة محاضرة يدويًا
  await page.locator('dialog[open] select').first().selectOption('thu');
  await page.locator('dialog[open] input[type=time]').nth(0).fill('09:00');
  await page.locator('dialog[open] input[type=time]').nth(1).fill('10:30');
  await page.getByPlaceholder('مثل: 101 تقن').fill('100 عرب');
  await page.getByRole('button', { name: 'إضافة' }).click();
  await page.getByRole('button', { name: 'اعتماد الجدول' }).click();
  await page.getByText('تمت مراجعته').waitFor();
  await page.screenshot({ path: join(out, 'e2e-student-preview.png'), fullPage: true });
  await page.getByRole('button', { name: /حفظ الصورة/ }).click();
  await page.getByRole('heading', { name: 'صورتك جاهزة' }).waitFor();
  const png = await page.evaluate(async () => {
    const img = document.querySelector('dialog[open] img');
    const res = await fetch(img.src);
    const blob = await res.blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    return { size: blob.size, b64: btoa(Array.from(buf, (b) => String.fromCharCode(b)).join('')) };
  });
  writeFileSync(join(out, 'e2e-student-wallpaper.png'), Buffer.from(png.b64, 'base64'));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jadwal-jamiah:design:v1') || 'null'));
  console.log(`exported ${png.size} bytes; saved lectures ${saved?.lectures?.length}, source ${saved?.source}`);
  // مسار الفشل: الخادم لا يستجيب → رسالة واضحة
  await page.getByRole('button', { name: 'إغلاق' }).click();
  mode = 'fail';
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'تصوير الجدول أو اختيار صورة' }).click()]);
  await chooser2.setFiles(join(root, 'tests', 'fixtures', '02-simple-bw.png'));
  await page.getByRole('alert').waitFor({ timeout: 30000 });
  const alert = await page.getByRole('alert').textContent();
  console.log('failure message:', alert);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const ok = items.length === lectures.length && saved?.lectures?.length === lectures.length + 1 && saved?.source === 'reviewed' && !overflow && /خادم|تعذر/.test(alert || '');
  console.log(ok ? 'STUDENT E2E OK' : `STUDENT E2E FAILED items=${items.length} saved=${saved?.lectures?.length} overflow=${overflow}`);
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error('STUDENT E2E FAILED', e);
  await page.screenshot({ path: join(out, 'e2e-student-error.png'), fullPage: true });
  process.exitCode = 1;
} finally {
  await browser.close();
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
}
