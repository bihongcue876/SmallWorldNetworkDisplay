/**
 * 带种子的伪随机数。返回值落在 [0, 1)。
 * 实现为 mulberry32，周期 2^32，状态仅一个 32 位整数。
 */
export type Rng = () => number;

/** 派生种子的用途，不同用途使用不同常量，互不干扰。 */
export type Purpose = 'graph' | 'pair' | 'long' | 'tie';

const PURPOSE_CODE: Record<Purpose, number> = {
  graph: 1,
  pair: 2,
  long: 3,
  tie: 4,
};

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32 位哈希，逐个参数按小端拆成 4 字节混合。
 * 不用字符串拼接，避免 ("12","3") 与 ("1","23") 相撞。
 */
export function hash32(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    let x = parts[i] >>> 0;
    for (let b = 0; b < 4; b++) {
      h = Math.imul(h ^ (x & 0xff), 0x01000193) >>> 0;
      x >>>= 8;
    }
  }
  return h >>> 0;
}

/** 由基础种子、用途与索引派生独立种子。 */
export function deriveSeed(base: number, purpose: Purpose, ...index: number[]): number {
  return hash32(base >>> 0, PURPOSE_CODE[purpose], ...index);
}

/**
 * 无偏整数抽样，结果落在 [0, maxExclusive)。
 * 用拒绝采样消除取模偏差，而不是 floor(rng() * max)。
 */
export function randomInt(rng: Rng, maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const limit = Math.floor(4294967296 / maxExclusive) * maxExclusive;
  let x = 0;
  do {
    x = (rng() * 4294967296) >>> 0;
  } while (x >= limit);
  return x % maxExclusive;
}
