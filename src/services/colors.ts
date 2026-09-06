/**
 * Stable colour per class/section. The palette is soft so black text stays
 * readable; assignment order follows first appearance and is persisted in
 * the schedule so a class keeps its colour forever.
 */
import { classKey } from '../engine/parse/scheduleValidator';

export const CLASS_PALETTE = [
  '#d6ecdf', // green
  '#d9e6f7', // blue
  '#fbe3c4', // orange
  '#f7d6e0', // pink
  '#e6dcf5', // purple
  '#fff1b8', // yellow
  '#d2f0ee', // teal
  '#f3dcd0', // terracotta
  '#e4e9d2', // olive
  '#e0e0ee', // lavender grey
  '#f9d9c9', // peach
  '#cfe8f3', // sky
];

export function assignClassColors(classNames: string[], existing: Record<string, string> = {}): Record<string, string> {
  const colors: Record<string, string> = { ...existing };
  const byKey = new Map<string, string>();
  for (const [name, color] of Object.entries(colors)) byKey.set(classKey(name), color);
  const used = new Set(Object.values(colors));
  for (const name of classNames) {
    if (!name) continue;
    const key = classKey(name);
    if (byKey.has(key)) {
      colors[name] = byKey.get(key)!;
      continue;
    }
    const next = CLASS_PALETTE.find((c) => !used.has(c)) ?? CLASS_PALETTE[byKey.size % CLASS_PALETTE.length];
    colors[name] = next;
    byKey.set(key, next);
    used.add(next);
  }
  return colors;
}

export function colorFor(colors: Record<string, string>, className: string): string | undefined {
  if (!className) return undefined;
  if (colors[className]) return colors[className];
  const key = classKey(className);
  for (const [name, color] of Object.entries(colors)) if (classKey(name) === key) return color;
  return undefined;
}
