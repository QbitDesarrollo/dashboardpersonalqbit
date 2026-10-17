import { useSyncExternalStore } from 'react';

let now = Date.now();
let interval: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function tick() {
  now = Date.now();
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    now = Date.now();
    interval = setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(interval);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    }
  };
}

const idleSubscribe = () => () => {};
const snapshot = () => now;

export function useTimerClock(running: boolean) {
  return useSyncExternalStore(running ? subscribe : idleSubscribe, snapshot, snapshot);
}
