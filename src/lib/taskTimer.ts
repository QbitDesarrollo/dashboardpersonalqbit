export function taskElapsedSeconds(accumulated: number, startTime: string | null, now: number): number {
  const base = Number.isFinite(accumulated) ? Math.max(0, accumulated) : 0;
  const start = startTime ? new Date(startTime).getTime() : NaN;
  return base + (Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : 0);
}

export function formatTaskTimer(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export const TIMER_CHANGED = 'tiusdei:timer-changed';
export const TIMER_STORAGE_KEY = 'tiusdei_timer_updated';

export function notifyTaskTimerChanged() {
  window.dispatchEvent(new Event(TIMER_CHANGED));
  try { localStorage.setItem(TIMER_STORAGE_KEY, String(Date.now())); } catch { /* Storage is optional. */ }
}
