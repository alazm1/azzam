/**
 * Renders the engine test fixtures with headless Chromium (real Arabic text
 * shaping, real fonts) and writes the ground truth next to each image.
 *
 *   node scripts/gen-fixtures.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BASE, DAYS, DAY_AR, PERIOD_AR, PERIOD_TIMES, AR_DIGITS, WORDED, expectedFrom } from './fixture-data.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'tests', 'fixtures');
const htmlDir = join(outDir, 'html');
mkdirSync(htmlDir, { recursive: true });

const fontFace = (family, file) => `@font-face{font-family:'${family}';src:url('../fonts/${file}') format('truetype');}`;
const FONTS = `
${fontFace('Cairo', 'Cairo-Regular.ttf')}
${fontFace('CairoBold', 'Cairo-Bold.ttf')}
${fontFace('Naskh', 'NotoNaskhArabic-Regular.ttf')}
${fontFace('NaskhBold', 'NotoNaskhArabic-Bold.ttf')}
${fontFace('Tajawal', 'Tajawal-Regular.ttf')}
${fontFace('TajawalBold', 'Tajawal-Bold.ttf')}
`;

const arDigit = (n) => String(n).replace(/[0-9]/g, (d) => AR_DIGITS[d]);

function page(body, extraCss = '', bodyStyle = '') {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${FONTS}
html,body{margin:0;padding:0;background:#fff;}
body{font-family:'Naskh','Cairo',sans-serif;color:#111;${bodyStyle}}
table{border-collapse:collapse;}
td,th{text-align:center;vertical-align:middle;}
${extraCss}
</style></head><body>${body}</body></html>`;
}

// ---------- Test 1: Madrasati-style print ----------
function madrasati() {
  const header = PERIOD_AR.slice(0, 7)
    .map((p, i) => `<th><div class="p">الحصة ${p}</div><div class="t">${PERIOD_TIMES[i]}</div></th>`)
    .join('');
  const rows = DAYS.map(
    (d) =>
      `<tr><th class="day">${DAY_AR[d]}</th>${BASE[d]
        .map((c) => (c ? `<td><div class="s">رياضيات</div><div class="c">${WORDED[c]}</div></td>` : '<td></td>'))
        .join('')}</tr>`,
  ).join('');
  const body = `
  <div class="wrap">
    <div class="top"><div class="logo"></div><div><div class="title">جدول الحصص الأسبوعي</div><div class="sub">المعلم: عبدالله بن سعد الغامدي &nbsp;|&nbsp; المدرسة: متوسطة الأمير سلطان &nbsp;|&nbsp; العام الدراسي ١٤٤٧هـ</div></div></div>
    <table><thead><tr><th class="corner">اليوم / الحصة</th>${header}</tr></thead><tbody>${rows}</tbody></table>
    <div class="foot">تم الطباعة من منصة مدرستي</div>
  </div>`;
  const css = `
  .wrap{padding:36px 44px;width:1320px;font-family:'Tajawal','Cairo',sans-serif;}
  .top{display:flex;gap:18px;align-items:center;margin-bottom:22px}
  .logo{width:56px;height:56px;border-radius:12px;background:#1b7f5a}
  .title{font-family:'TajawalBold';font-size:26px;color:#1b7f5a}
  .sub{font-size:15px;color:#444;margin-top:4px}
  table{width:100%;border:2px solid #2a6f4e}
  th,td{border:1px solid #6aa58a;height:74px}
  thead th{background:#1b7f5a;color:#fff;font-family:'TajawalBold';font-size:17px}
  thead .t{font-size:13px;font-weight:normal;color:#dff3e8;margin-top:2px}
  th.corner{background:#145c41;width:110px}
  th.day{background:#e6f4ec;color:#145c41;font-family:'TajawalBold';font-size:20px;width:120px}
  td .s{font-size:16px;color:#333}
  td .c{font-size:17px;font-family:'TajawalBold';color:#145c41;margin-top:3px}
  .foot{margin-top:14px;font-size:13px;color:#777}`;
  return { html: page(body, css), expected: expectedFrom(BASE, { subject: 'رياضيات', classMap: WORDED }), width: 1320, orientation: 'days-in-rows' };
}

// ---------- Test 2: simple black & white print ----------
function simpleBw() {
  const header = [1, 2, 3, 4, 5, 6, 7].map((n) => `<th>${arDigit(n)}</th>`).join('');
  const rows = DAYS.map((d) => `<tr><th>${DAY_AR[d]}</th>${BASE[d].map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('');
  const body = `<div class="wrap"><div class="title">جدول المعلم: خالد العتيبي</div>
  <table><tr><th>اليوم</th>${header}</tr>${rows}</table></div>`;
  const css = `.wrap{padding:40px;width:1000px}.title{font-size:24px;margin-bottom:16px;font-family:'NaskhBold'}
  table{width:100%;border:2px solid #000}th,td{border:1px solid #000;height:66px;font-size:24px}th{font-family:'NaskhBold'}`;
  return { html: page(body, css), expected: expectedFrom(BASE), width: 1000, orientation: 'days-in-rows' };
}

// ---------- Test 3: colored table, class colors ----------
function colored() {
  const colors = { '١/أ': '#ffe0b2', '١/ب': '#c8e6c9', '٢/أ': '#bbdefb', '٢/ب': '#f8bbd0', '٣/أ': '#e1bee7' };
  const header = PERIOD_AR.slice(0, 7).map((p) => `<th>${p}</th>`).join('');
  const rows = DAYS.map(
    (d) => `<tr><th class="d">${DAY_AR[d]}</th>${BASE[d].map((c) => (c ? `<td style="background:${colors[c]}">${c}<br><span>علوم</span></td>` : '<td></td>')).join('')}</tr>`,
  ).join('');
  const body = `<div class="wrap"><table><tr><th class="corner">الأيام</th>${header}</tr>${rows}</table></div>`;
  const css = `.wrap{padding:30px;width:1100px;background:#fafafa}
  table{width:100%;border:3px solid #37474f}th,td{border:2px solid #546e7a;height:78px;font-size:22px;font-family:'Cairo'}
  tr:first-child th{background:#37474f;color:#fff;font-family:'CairoBold'}th.d{background:#eceff1;font-family:'CairoBold'}
  td span{font-size:15px;color:#455a64}`;
  return { html: page(body, css), expected: expectedFrom(BASE, { subject: 'علوم' }), width: 1100, orientation: 'days-in-rows' };
}

// ---------- Test 4: days in rows, periods in columns, with times row ----------
function daysRows() {
  const header = [1, 2, 3, 4, 5, 6, 7].map((n) => `<th>الحصة ${arDigit(n)}</th>`).join('');
  const times = PERIOD_TIMES.slice(0, 7).map((t) => `<td class="t">${t}</td>`).join('');
  const rows = DAYS.map((d) => `<tr><th>${DAY_AR[d]}</th>${BASE[d].map((c) => `<td>${c ? c.replace('/', ' / ') : '—'}</td>`).join('')}</tr>`).join('');
  const body = `<div class="wrap"><table><tr><th rowspan="2">اليوم</th>${header}</tr><tr>${times}</tr>${rows}</table></div>`;
  const css = `.wrap{padding:24px;width:1150px}table{width:100%}th,td{border:1px solid #222;height:60px;font-size:21px}
  th{background:#e8f5e9}td.t{font-size:14px;height:30px;color:#555}`;
  return { html: page(body, css), expected: expectedFrom(BASE), width: 1150, orientation: 'days-in-rows' };
}

// ---------- Test 5: days in columns, periods in rows ----------
function daysCols() {
  const header = DAYS.map((d) => `<th>${DAY_AR[d]}</th>`).join('');
  const rows = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => `<tr><th>${PERIOD_AR[i]}</th>${DAYS.map((d) => `<td>${BASE[d][i] ?? ''}</td>`).join('')}</tr>`)
    .join('');
  const body = `<div class="wrap"><div class="title">الجدول الدراسي — الفصل الأول</div><table><tr><th>الحصة</th>${header}</tr>${rows}</table></div>`;
  const css = `.wrap{padding:36px;width:900px}.title{font-size:22px;margin-bottom:14px;font-family:'CairoBold'}
  table{width:100%;border:2px solid #333}th,td{border:1px solid #333;height:58px;font-size:22px;font-family:'Cairo'}th{background:#f1f3f4;font-family:'CairoBold'}`;
  return { html: page(body, css), expected: expectedFrom(BASE), width: 900, orientation: 'days-in-columns' };
}

// ---------- Test 6: photo taken at an angle ----------
function angled() {
  const base = colored();
  const css = `
  body{background:radial-gradient(circle at 30% 20%,#8a6d4b,#5c4632 70%);padding:60px 80px;width:1300px;height:900px;box-sizing:border-box;}
  .paper{background:#fdfdfb;box-shadow:0 30px 60px rgba(0,0,0,.45);transform:perspective(1600px) rotateX(9deg) rotateY(-7deg) rotate(3.5deg);transform-origin:center;display:inline-block}
  .wrap{padding:30px;width:1100px;background:transparent}
  table{width:100%;border:3px solid #37474f}th,td{border:2px solid #546e7a;height:78px;font-size:22px;font-family:'Cairo'}
  tr:first-child th{background:#37474f;color:#fff;font-family:'CairoBold'}th.d{background:#eceff1;font-family:'CairoBold'}
  td span{font-size:15px;color:#455a64}`;
  const html = base.html.replace(/<style>[\s\S]*?<\/style>/, `<style>${FONTS}html,body{margin:0}body{font-family:'Naskh';color:#111}table{border-collapse:collapse}td,th{text-align:center;vertical-align:middle}${css}</style>`)
    .replace('<body>', '<body><div class="paper">')
    .replace('</body>', '</div></body>');
  return { html, expected: base.expected, width: 1300, height: 900, orientation: 'days-in-rows' };
}

// ---------- Test 7: medium quality (small, JPEG artefacts) ----------
function mediumQuality() {
  const base = simpleBw();
  // full-size page, but heavy JPEG compression, slight blur and lower contrast
  // (what a schedule looks like after being forwarded through a chat app)
  const html = base.html.replace('</style>', 'body{filter:blur(0.6px) contrast(0.85) brightness(1.05);}</style>');
  return { ...base, html, jpeg: 35, scale: 1 };
}

// ---------- Test 8: empty + merged cells ----------
function merged() {
  const sched = {
    sun: ['١/أ', null, null, '٣/أ', '١/ب', null, '٢/أ'],
    mon: ['٢/أ', '١/أ', null, null, '٢/ب', '١/ب', null],
    tue: [null, '٣/أ', '١/ب', '١/ب', null, '١/أ', null],
    wed: ['١/ب', null, '٢/ب', null, '٣/أ', null, '٢/أ'],
    thu: ['٣/أ', '٣/أ', null, '١/ب', null, null, '١/أ'],
  };
  // merged: tue p3-4 (١/ب) and thu p1-2 (٣/أ)
  const mergedSpans = { tue: [[2, 2]], thu: [[0, 2]] };
  const header = [1, 2, 3, 4, 5, 6, 7].map((n) => `<th>${arDigit(n)}</th>`).join('');
  const rows = DAYS.map((d) => {
    let cellsTop = '';
    let cellsBottom = '';
    for (let i = 0; i < 7; ) {
      const span = (mergedSpans[d] || []).find(([s]) => s === i);
      const cls = sched[d][i];
      if (span) {
        cellsTop += `<td colspan="${span[1]}" rowspan="2" class="m">${cls}<br><span>رياضيات</span></td>`;
        i += span[1];
        continue;
      }
      cellsTop += `<td>${cls ?? ''}</td>`;
      cellsBottom += `<td class="s">${cls ? 'رياضيات' : ''}</td>`;
      i++;
    }
    return `<tr><th rowspan="2">${DAY_AR[d]}</th>${cellsTop}</tr><tr>${cellsBottom}</tr>`;
  }).join('');
  const body = `<div class="wrap"><table><tr><th>اليوم</th>${header}</tr>${rows}</table></div>`;
  const css = `.wrap{padding:30px;width:1100px}table{width:100%;border:2px solid #000}th,td{border:1px solid #000;font-size:22px;height:44px}
  th{background:#eee;font-family:'NaskhBold'}td.s{font-size:14px;color:#444;height:26px}td.m{background:#fff8e1}td.m span{font-size:14px;color:#444}`;
  return { html: page(body, css), expected: expectedFrom(sched, { subject: 'رياضيات' }), width: 1100, orientation: 'days-in-rows' };
}

const CASES = [
  ['01-madrasati', madrasati],
  ['02-simple-bw', simpleBw],
  ['03-colored', colored],
  ['04-days-rows', daysRows],
  ['05-days-cols', daysCols],
  ['06-angled', angled],
  ['07-medium-quality', mediumQuality],
  ['08-merged-empty', merged],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  for (const [name, build] of CASES) {
    const spec = build();
    const htmlPath = join(htmlDir, `${name}.html`);
    writeFileSync(htmlPath, spec.html);
    const context = await browser.newContext({
      viewport: { width: spec.width, height: spec.height ?? 800 },
      deviceScaleFactor: spec.scale ?? 1.5,
    });
    const pg = await context.newPage();
    await pg.goto(pathToFileURL(htmlPath).href);
    await pg.evaluate(() => document.fonts.ready);
    const ext = spec.jpeg ? 'jpg' : 'png';
    const shot = { path: join(outDir, `${name}.${ext}`), fullPage: !spec.height };
    if (spec.jpeg) Object.assign(shot, { type: 'jpeg', quality: spec.jpeg });
    await pg.screenshot(shot);
    writeFileSync(join(outDir, `${name}.expected.json`), JSON.stringify({ name, orientation: spec.orientation, lessons: spec.expected }, null, 2));
    await context.close();
    console.log('rendered', name);
  }
} finally {
  await browser.close();
}
