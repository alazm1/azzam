import type { TeacherSchedule } from '../models/schedule';

/**
 * Persistence boundary. The first version stores everything on the device
 * (localStorage). A Supabase-backed repository can implement the same
 * interface later to sync between devices without touching the UI.
 */
export interface ScheduleRepository {
  load(): Promise<TeacherSchedule | null>;
  save(schedule: TeacherSchedule): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'jadwal-almuallim:schedule:v1';

export class LocalStorageRepository implements ScheduleRepository {
  async load(): Promise<TeacherSchedule | null> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TeacherSchedule;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.lessons)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async save(schedule: TeacherSchedule): Promise<void> {
    try {
      localStorage.setItem(KEY, JSON.stringify(schedule));
    } catch {
      // storage full / private mode: keep working in memory
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
}

export const scheduleRepository: ScheduleRepository = new LocalStorageRepository();
