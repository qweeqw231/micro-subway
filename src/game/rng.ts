export type Rng = () => number;

/**
 * sfc32: small, deterministic, good enough for passenger spawns.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  let b = (seed ^ 0x9e3779b9) >>> 0;
  let c = (seed ^ 0x243f6a88) >>> 0;
  let d = (seed ^ 0xb7e15162) >>> 0;

  const next = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };

  for (let i = 0; i < 12; i += 1) {
    next();
  }

  return next;
}
