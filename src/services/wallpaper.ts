/**
 * Draws the schedule wallpaper on a canvas (phone 1200×2600 or landscape
 * 1920×1280). Days are columns, periods are rows; each class keeps its colour.
 */
import { arabic, classKey, DAYS, getClasses, isFilled, type DesignState, type ThemeKey } from '../models/design';

export interface Theme {
  bg: string;
  ink: string;
  muted: string;
  line: string;
  empty: string;
  bar: string;
  barText: string;
}

export const THEMES: Record<ThemeKey, Theme> = {
  green: { bg: '#eaf3ee', ink: '#0e4c40', muted: '#5e8171', line: '#c5d9cd', empty: '#e2ece5', bar: '#0e4c40', barText: '#f1f8f1' },
  night: { bg: '#112e29', ink: '#eef6ed', muted: '#9bb7a9', line: '#38564c', empty: '#1b3931', bar: '#cce998', barText: '#15352d' },
  paper: { bg: '#ffffff', ink: '#203d34', muted: '#758579', line: '#dae4de', empty: '#f1f5f2', bar: '#233f35', barText: '#ffffff' },
};

const FONT = "'Cairo', Tahoma, Arial, sans-serif";

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

interface TextOpts {
  weight?: number;
  align?: CanvasTextAlign;
  max?: number;
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, { weight = 400, align = 'right', max }: TextOpts = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  const value = arabic(s);
  if (max) {
    let z = size;
    while (ctx.measureText(value).width > max && z > size * 0.62) {
      z--;
      ctx.font = `${weight} ${z}px ${FONT}`;
    }
    ctx.fillText(value, x, y, max);
  } else ctx.fillText(value, x, y);
}

function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, fontSize: number, maxLines = 2): string[] {
  ctx.font = `700 ${fontSize}px ${FONT}`;
  const words = String(value).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const s = line ? `${line} ${word}` : word;
    if (ctx.measureText(s).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = s;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) return [lines.slice(0, -1).join(' '), lines[lines.length - 1]].slice(-maxLines);
  return lines;
}

/** Dark or light ink for a given background colour. */
export function contrastInk(hex: string): string {
  const c = hex.replace('#', '');
  const nums = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lum = nums.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] > 0.42 ? '#203c32' : '#ffffff';
}

export interface DrawStats {
  width: number;
  height: number;
  count: number;
  classes: ReturnType<typeof getClasses>;
}

export function drawSchedule(canvas: HTMLCanvasElement, state: DesignState): DrawStats {
  const phone = state.format === 'phone';
  const W = phone ? 1200 : 1920;
  const H = phone ? 2600 : 1280;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const t = THEMES[state.theme] ?? THEMES.green;
  const dayCount = state.grid[0]?.length || 5;
  const N = state.grid.length;
  const classes = getClasses(state.grid);
  const colors = new Map(classes.map((c) => [c.key, state.colors[c.key] || c.color]));

  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  // On phones a quiet area is left at the top for the lock-screen clock.
  const margin = phone ? 64 : 96;
  const top = phone ? (state.clock ? 740 : 230) : 130;
  const usable = W - 2 * margin;
  text(ctx, state.title || 'جدولي الأسبوعي', W - margin, top, phone ? 88 : 75, t.ink, { weight: 700, max: usable });
  const subtitle = state.name.trim() || 'الجدول الدراسي';
  text(ctx, subtitle, W - margin, top + 93, phone ? 39 : 34, t.muted, { max: usable });
  const count = state.grid.flat().filter(isFilled).length;
  const metaY = top + 169;
  ctx.fillStyle = t.line;
  ctx.fillRect(margin, metaY, usable, 2);
  text(ctx, `${arabic(count)} حصة أسبوعيًا`, W - margin, metaY + 43, 28, t.muted);
  text(ctx, `${DAYS[0]} — ${DAYS[dayCount - 1]}`, margin, metaY + 43, 28, t.muted, { align: 'left' });

  const gridTop = metaY + 98;
  const headH = phone ? 87 : 72;
  const labelW = phone ? 74 : 100;
  const colW = (usable - labelW) / dayCount;
  const gap = phone ? 12 : 15;
  const maxRowH = phone ? 145 : 101;
  const available = H - gridTop - headH - (phone ? 245 : 105);
  const rowH = Math.min(maxRowH, Math.floor(available / Math.max(1, N)));
  round(ctx, margin, gridTop, usable, headH, phone ? 20 : 16, t.bar);
  text(ctx, 'الحصة', W - margin - labelW / 2, gridTop + headH / 2, phone ? 24 : 25, t.barText, { align: 'center', max: labelW - 12 });
  for (let d = 0; d < dayCount; d++) {
    const x = W - margin - labelW - colW * (d + 1);
    text(ctx, DAYS[d], x + colW / 2, gridTop + headH / 2, phone ? 33 : 31, t.barText, { weight: 700, align: 'center', max: colW - 18 });
  }
  for (let p = 0; p < N; p++) {
    const y = gridTop + headH + 14 + p * rowH;
    text(ctx, arabic(p + 1), W - margin - labelW / 2, y + (rowH - gap) / 2, phone ? 36 : 32, t.muted, { align: 'center' });
    for (let d = 0; d < dayCount; d++) {
      const cell = state.grid[p][d];
      const x = W - margin - labelW - colW * (d + 1);
      const filled = isFilled(cell);
      const bg = filled ? colors.get(classKey(cell.classroom)) ?? '#e6e8de' : t.empty;
      round(ctx, x + gap / 2, y, colW - gap, rowH - gap, phone ? 17 : 12, bg);
      if (!filled) {
        text(ctx, '—', x + colW / 2, y + (rowH - gap) / 2, 28, t.muted, { align: 'center' });
        continue;
      }
      const ink = contrastInk(bg);
      const primary = cell.classroom || (state.showSubject ? cell.subject : 'حصة') || (cell.occupied ? 'تحتاج مراجعة' : '');
      const hasSub = state.showSubject && !!cell.classroom && !!cell.subject;
      const f = Math.min(phone ? 34 : 31, Math.floor((rowH - gap) / (hasSub ? 3.25 : 2.35)));
      const lines = wrap(ctx, primary, colW - 30, f, 2);
      const cy = y + (rowH - gap) / 2 - ((lines.length - 1) * f * 1.16 + (hasSub ? f * 0.95 : 0)) / 2;
      for (let i = 0; i < lines.length; i++) text(ctx, lines[i], x + colW / 2, cy + i * f * 1.16, f, ink, { weight: 700, align: 'center', max: colW - 25 });
      if (hasSub) text(ctx, cell.subject, x + colW / 2, cy + (lines.length - 1) * f * 1.16 + f * 0.95, Math.min(phone ? 24 : 22, Math.floor(f * 0.75)), ink, { align: 'center', max: colW - 30 });
    }
  }
  const bottom = gridTop + headH + 14 + N * rowH;
  ctx.fillStyle = t.line;
  ctx.fillRect(margin, bottom + 32, usable, 2);
  text(ctx, 'جدول الأسبوع', W - margin, bottom + 77, phone ? 29 : 26, t.muted);
  text(ctx, `${arabic(classes.length)} فصول`, margin, bottom + 77, phone ? 29 : 26, t.muted, { align: 'left' });
  return { width: W, height: H, count, classes };
}

/** Makes sure the Cairo faces are available to the canvas before drawing. */
export async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([document.fonts.load("700 40px 'Cairo'"), document.fonts.load("400 40px 'Cairo'")]);
  } catch {
    // fall back to system fonts
  }
}
