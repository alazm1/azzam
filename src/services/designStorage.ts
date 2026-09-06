import { defaultState, type DesignState } from '../models/design';

const KEY = 'jadwal-almuallim:design:v1';

/**
 * Local persistence of the design (grid + styling). Kept behind a tiny API
 * so a synced backend (Supabase) can replace it later.
 */
export function loadDesign(): DesignState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.grid)) return null;
    return { ...defaultState(), ...parsed };
  } catch {
    return null;
  }
}

export function saveDesign(state: DesignState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // private mode / quota: keep working in memory
  }
}

export function clearDesign(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
