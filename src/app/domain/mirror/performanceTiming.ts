const activeTimers = new Set<string>();

export function startDevTimer(label: string): void {
  if (!import.meta.env.DEV) return;
  activeTimers.add(label);
  console.time(label);
}

export function endDevTimer(label: string): void {
  if (!import.meta.env.DEV || !activeTimers.delete(label)) return;
  console.timeEnd(label);
}
