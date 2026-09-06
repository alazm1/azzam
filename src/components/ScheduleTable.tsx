import { DAY_NAMES_AR, PERIOD_NAMES_AR } from '../engine/parse/lexicon';
import { toArabicDigits } from '../engine/parse/normalize';
import type { ConfidenceLevel } from '../engine/types';
import type { DayKey } from '../models/schedule';

export interface TableCell {
  className: string;
  subject?: string;
  room?: string;
  note?: string;
  color?: string;
  level?: ConfidenceLevel;
}

export type Zoom = 'compact' | 'normal' | 'large';

interface Props {
  days: DayKey[];
  periods: number[];
  cellAt: (day: DayKey, period: number) => TableCell | undefined;
  onCellClick?: (day: DayKey, period: number) => void;
  highlightDay?: DayKey;
  highlightPeriod?: number;
  zoom?: Zoom;
  showPeriodNames?: boolean;
}

const ZOOM: Record<Zoom, { min: string; font: string; pad: string }> = {
  compact: { min: '3.4rem', font: 'text-[11px]', pad: 'p-1' },
  normal: { min: '4.6rem', font: 'text-sm', pad: 'p-1.5' },
  large: { min: '6.5rem', font: 'text-base', pad: 'p-2' },
};

/**
 * The schedule grid. Days are rows, periods are columns (the day column sits
 * on the right in RTL). Wide grids scroll inside their own container so the
 * page itself never scrolls sideways.
 */
export function ScheduleTable({ days, periods, cellAt, onCellClick, highlightDay, highlightPeriod, zoom = 'normal', showPeriodNames = false }: Props) {
  const z = ZOOM[zoom];
  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-separate border-spacing-0" style={{ minWidth: `calc(${periods.length} * ${z.min} + 5rem)` }}>
        <thead>
          <tr>
            <th className="sticky right-0 z-10 border-b border-l border-line bg-primary-light px-2 py-2 text-sm font-bold text-primary-dark">اليوم</th>
            {periods.map((p) => (
              <th
                key={p}
                className={`border-b border-l border-line px-1 py-2 text-center text-sm font-bold ${highlightPeriod === p ? 'bg-primary text-white' : 'bg-primary-light text-primary-dark'}`}
                style={{ minWidth: z.min }}
              >
                {showPeriodNames ? PERIOD_NAMES_AR[p] ?? toArabicDigits(p) : toArabicDigits(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const isToday = day === highlightDay;
            return (
              <tr key={day} className={isToday ? 'bg-primary-light/60' : ''}>
                <th className={`sticky right-0 z-10 border-b border-l border-line px-2 py-2 text-sm font-bold ${isToday ? 'bg-primary text-white' : 'bg-canvas text-ink'}`}>
                  {DAY_NAMES_AR[day]}
                </th>
                {periods.map((p) => {
                  const cell = cellAt(day, p);
                  const clickable = !!onCellClick;
                  const levelClass =
                    cell?.level === 'low' ? 'ring-2 ring-inset ring-danger' : cell?.level === 'medium' ? 'ring-2 ring-inset ring-warn' : '';
                  return (
                    <td key={p} className={`border-b border-l border-line ${z.pad} align-top`} style={{ height: zoom === 'compact' ? '2.8rem' : '3.6rem' }}>
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => onCellClick?.(day, p)}
                        className={`flex h-full min-h-[2.4rem] w-full flex-col items-center justify-center rounded-lg ${z.font} leading-tight ${levelClass} ${cell ? 'text-ink' : 'text-muted/40'} ${clickable ? 'active:scale-95 transition-transform' : ''}`}
                        style={{ background: cell?.color ?? (cell ? '#eef2ef' : 'transparent') }}
                        aria-label={`${DAY_NAMES_AR[day]} الحصة ${toArabicDigits(p)}${cell ? `: ${cell.className}` : ': فارغة'}`}
                      >
                        {cell ? (
                          <>
                            <span className="font-bold">{cell.className || '—'}</span>
                            {cell.subject && zoom !== 'compact' && <span className="text-[0.8em] text-muted">{cell.subject}</span>}
                            {cell.level === 'low' && <span className="text-[0.75em] font-bold text-danger">راجع</span>}
                          </>
                        ) : (
                          <span aria-hidden="true">{clickable ? '+' : ''}</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
