/**
 * 方向顺序即路由检查顺序：右、下、左、上。
 * 改动顺序会改变平局结果，属于模型口径，不允许随手调整。
 */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** 环面一维距离。 */
export function axisDelta(a: number, b: number, n: number): number {
  const d = a > b ? a - b : b - a;
  return d <= n >> 1 ? d : n - d;
}

/** 环面曼哈顿距离，a、b 为节点编号。 */
export function torusDistance(a: number, b: number, n: number): number {
  return axisDelta(a % n, b % n, n) + axisDelta((a / n) | 0, (b / n) | 0, n);
}

/** 环面上可能的最大距离，等于 2 * floor(n/2)。 */
export function maxDistance(n: number): number {
  return 2 * (n >> 1);
}

/** 坐标转节点编号，坐标按正模归一，可传负值。 */
export function nodeId(x: number, y: number, n: number): number {
  const xx = ((x % n) + n) % n;
  const yy = ((y % n) + n) % n;
  return yy * n + xx;
}

export function coordsOf(id: number, n: number): { x: number; y: number } {
  return { x: id % n, y: (id / n) | 0 };
}
