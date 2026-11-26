import { describe, expect, it } from 'vitest';
import { THEORY_HTML } from '../src/web/theory.ts';

/**
 * 「结论」页的内容契约：三条文献结论必须按原论文编号标注，
 * 且必须保留「引用」与「本项目实测」的区分，以及可外推范围的声明。
 */
describe('theory panel', () => {
  it('cites the three Kleinberg bounds with their theorem numbers', () => {
    expect(THEORY_HTML).toContain('Theorem 3(b)');
    expect(THEORY_HTML).toContain('Theorem 3(a)');
    expect(THEORY_HTML).toContain('Theorem 2');
    expect(THEORY_HTML).toContain('n<sup>(q−2)/(q−1)</sup>');
    expect(THEORY_HTML).toContain('n<sup>(2−q)/3</sup>');
    expect(THEORY_HTML).toContain('(log n)²');
  });

  it('states the model and the routing rule', () => {
    expect(THEORY_HTML).toContain('曼哈顿距离');
    expect(THEORY_HTML).toContain('d(u,v)<sup>−q</sup>');
    expect(THEORY_HTML).toContain('严格更近才走');
  });

  it('keeps cited results apart from measurements', () => {
    expect(THEORY_HTML).toContain('非本项目证明');
    expect(THEORY_HTML).toContain('本项目实测');
  });

  it('declares the limits of what the experiment shows', () => {
    expect(THEORY_HTML).toContain('没有、也不打算重新证明它');
    expect(THEORY_HTML).toContain('不直接外推到真实网络');
  });

  it('does not leave unbalanced tags', () => {
    const open = (THEORY_HTML.match(/<div\b/g) ?? []).length;
    const close = (THEORY_HTML.match(/<\/div>/g) ?? []).length;
    expect(open).toBe(close);
    const sections = (THEORY_HTML.match(/<section\b/g) ?? []).length;
    const sectionEnds = (THEORY_HTML.match(/<\/section>/g) ?? []).length;
    expect(sections).toBe(sectionEnds);
  });
});
