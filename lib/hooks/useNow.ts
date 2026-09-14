'use client';
import { useSyncExternalStore } from 'react';

let snapshot = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function tick() {
  snapshot = Date.now();
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    snapshot = Date.now();
    timer = setInterval(tick, 15000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) { clearInterval(timer); timer = undefined; }
  };
}
/** Stable server snapshot avoids hydration drift; one shared clock powers expiry UI. */
export function useNow() {
  return useSyncExternalStore(subscribe, () => snapshot, () => 0);
}
