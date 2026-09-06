// Renders the PWA PNG icons from public/icons/icon.svg with headless Chromium.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const svg = readFileSync(join(root, 'public', 'icons', 'icon.svg'), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(root, 'public', 'icons', `icon-${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons rendered');
