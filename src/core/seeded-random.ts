import { todayStr } from "./files";

/**
 * SHA-256 seeded PRNG. Produces deterministic floats from a seed string.
 * Uses a 128-bit state extracted from the SHA-256 hash.
 */
export class SeededRandom {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(hash: Uint8Array) {
    const view = new DataView(hash.buffer);
    this.s0 = view.getUint32(0) >>> 0;
    this.s1 = view.getUint32(4) >>> 0;
    this.s2 = view.getUint32(8) >>> 0;
    this.s3 = view.getUint32(12) >>> 0;
    // warm up
    for (let i = 0; i < 8; i++) this.next();
  }

  private next(): number {
    const t = this.s1 << 9;
    let r = this.s0 * 5;
    r = ((r << 7) | (r >>> 25)) * 9;
    const result = r >>> 0;

    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = ((this.s3 << 11) | (this.s3 >>> 21)) >>> 0;

    return result;
  }

  /** Returns a float in [0, 1) */
  random(): number {
    return this.next() / 0x100000000;
  }

  /** Returns an integer in [min, max] (inclusive) */
  randint(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }
}

export async function seededRandom(extra = ""): Promise<SeededRandom> {
  const seed = todayStr() + extra;
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed))
  );
  return new SeededRandom(hash);
}
