import { defaultStudentState, type StudentState } from './model';

const KEY = 'jadwal-jamiah:design:v1';

export function loadStudentDesign(): StudentState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudentState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.lectures)) return null;
    return { ...defaultStudentState(), ...parsed };
  } catch {
    return null;
  }
}

export function saveStudentDesign(state: StudentState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // private mode / quota: keep working in memory
  }
}
