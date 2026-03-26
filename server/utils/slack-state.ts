// In-memory OAuth state store with TTL (10 minutes)
const states = new Map<string, number>();
const TTL = 10 * 60 * 1000;

export function generateState(): string {
  const state = crypto.randomUUID();
  states.set(state, Date.now());
  // Clean up expired states
  for (const [key, ts] of states) {
    if (Date.now() - ts > TTL) states.delete(key);
  }
  return state;
}

export function verifyState(state: string): boolean {
  const ts = states.get(state);
  if (!ts) return false;
  states.delete(state);
  return Date.now() - ts < TTL;
}
