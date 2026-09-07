/**
 * Draws the university wallpaper: days as columns (first day on the right),
 * hours as rows; each lecture is a block spanning its time range and each
 * course keeps its colour. Same sizes/themes as the teacher edition.
 */
import { contrastInk, FONT, round, text, THEMES, wrap } from '../services/wallpaper';
import { activeDays, arabic, courseKey, DAY_NAMES, fmtHour, fmtTime, getCourses, hourRange, type StudentState } from './model';

export interface StudentDrawStats {
  width: number;
  height: number;
  count: number;
  courses: ReturnType<typeof getCourses>;
  startHour: number;
  endHour: number;
}

export function drawStudentSchedule(canvas: HTMLCanvasElement, state: StudentState): StudentDrawStats {
  const phone = state.format === 'phone';
  const W = phone ? 1200 : 1920;
  const H = phone ? 2600 : 1280;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const t = THEMES[state.theme] ?? THEMES.green;
  const days = activeDays(state.lectures);
  const courses = getCourses(state.lectures);
  const colors = new Map(courses.map((c) => [c.key, state.colors[c.key] || c.color]));
  const { startHour, endHour } = hourRange(state.lectures);
  const hours = endHour - startHour;

  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  const margin = phone ? 64 : 96;
  const top = phone ? (state.clock ? 740 : 230) : 130;
  const usable = W - 2 * margin;
  text(ctx, state.title || 'جدولي الجامعي', W - margin, top, phone ? 88 : 75, t.ink, { weight: 700, max: usable });
  const subtitle = state.name.trim() || 'الجدول الدراسي';
  text(ctx, subtitle, W - margin, top + 93, phone ? 39 : 34, t.muted, { max: usable });
  const count = state.lectures.length;
  const metaY = top + 169;
  ctx.fillStyle = t.line;
  ctx.fillRect(margin, metaY, usable, 2);
  text(ctx, `${arabic(count)} محاضرة أسبوعيًا`, W - margin, metaY + 43, 28, t.muted);
  text(ctx, `من ${fmtHour(startHour)} إلى ${fmtHour(endHour)}`, margin, metaY + 43, 28, t.muted, { align: 'left' });

  // الأيام أعمدة (الأول على اليمين) والساعات صفوف
  const gridTop = metaY + 98;
  const headH = phone ? 87 : 72;
  const labelW = phone ? 96 : 110;
  const colW = (usable - labelW) / days.length;
  const gap = phone ? 10 : 12;
  const available = H - gridTop - headH - (phone ? 245 : 105);
  const rowH = Math.min(phone ? 260 : 190, Math.max(70, Math.floor(available / Math.max(1, hours))));
  round(ctx, margin, gridTop, usable, headH, phone ? 20 : 16, t.bar);
  text(ctx, 'الوقت', W - margin - labelW / 2, gridTop + headH / 2, phone ? 26 : 24, t.barText, { weight: 700, align: 'center', max: labelW - 10 });
  const colX = (i: number) => W - margin - labelW - colW * (i + 1);
  days.forEach((d, i) => text(ctx, DAY_NAMES[d], colX(i) + colW / 2, gridTop + headH / 2, phone ? 32 : 30, t.barText, { weight: 700, align: 'center', max: colW - 14 }));

  const bodyTop = gridTop + headH + 14;
  const yOf = (min: number) => bodyTop + ((min - startHour * 60) / 60) * rowH;
  // خلفية الصفوف وخطوط الساعات
  for (let h = 0; h < hours; h++) {
    const y = bodyTop + h * rowH;
    days.forEach((_, i) => round(ctx, colX(i) + gap / 2, y + gap / 2, colW - gap, rowH - gap, phone ? 14 : 10, t.empty));
    text(ctx, fmtHour(startHour + h), W - margin - labelW / 2, y + gap / 2 + 22, phone ? 34 : 30, t.muted, { weight: 700, align: 'center' });
  }
  const bottom = bodyTop + hours * rowH;
  text(ctx, fmtHour(endHour), W - margin - labelW / 2, bottom + 4, phone ? 26 : 24, t.muted, { align: 'center' });

  // المحاضرات
  for (const l of state.lectures) {
    const i = days.indexOf(l.day);
    if (i < 0) continue;
    const x = colX(i) + gap / 2;
    const y = yOf(Math.max(l.start, startHour * 60)) + gap / 2;
    const h = Math.max(36, yOf(Math.min(l.end, endHour * 60)) - yOf(Math.max(l.start, startHour * 60)) - gap);
    const bg = colors.get(courseKey(l.course)) ?? '#e6e8de';
    round(ctx, x, y, colW - gap, h, phone ? 14 : 10, bg);
    const ink = contrastInk(bg);
    const inner = colW - gap - 18;
    const room = state.showRoom && l.room ? l.room : '';
    // الأرقام العربية تُعامل كأرقام ثنائية الاتجاه؛ علامة LRM حول الشرطة تثبّت البداية على اليسار
    const time = state.showTime ? `${fmtTime(l.start)}\u200E–\u200E${fmtTime(l.end)}` : '';
    const extras: Array<[string, CanvasDirection]> = [];
    if (room) extras.push([room, 'rtl']);
    if (time) extras.push([time, 'ltr']);
    const f = Math.min(phone ? 30 : 27, Math.floor(colW / 5.2), Math.floor(h / (extras.length ? 4 : 2.6)));
    const small = Math.max(15, Math.floor(f * 0.72));
    const lines = wrap(ctx, l.course || 'محاضرة', inner, f, h > f * 4 ? 3 : 2);
    const block = lines.length * f * 1.15 + extras.length * small * 1.25;
    let cy = y + h / 2 - block / 2 + f * 0.6;
    for (const line of lines) {
      text(ctx, line, x + (colW - gap) / 2, cy, f, ink, { weight: 700, align: 'center', max: inner });
      cy += f * 1.15;
    }
    ctx.font = `400 ${small}px ${FONT}`;
    for (const [e, dir] of extras) {
      text(ctx, e, x + (colW - gap) / 2, cy + small * 0.1, small, ink, { align: 'center', max: inner, dir });
      cy += small * 1.25;
    }
  }

  ctx.fillStyle = t.line;
  ctx.fillRect(margin, bottom + 40, usable, 2);
  text(ctx, 'جدول الأسبوع', W - margin, bottom + 85, phone ? 29 : 26, t.muted);
  text(ctx, `${arabic(courses.length)} مقررات`, margin, bottom + 85, phone ? 29 : 26, t.muted, { align: 'left' });
  return { width: W, height: H, count, courses, startHour, endHour };
}
