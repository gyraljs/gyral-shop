// Deterministic pseudo-random numbers for property-style tests (no extra dependency).
export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export const intBetween = (next: () => number, min: number, max: number): number =>
  min + Math.floor(next() * (max - min + 1));
