import { describe, it, expect } from 'vitest';
import { computeScale } from './fit';

describe('computeScale', () => {
  it('never enlarges: a grid smaller than its area scales to 1', () => {
    expect(computeScale({ w: 1000, h: 800 }, { w: 500, h: 400 })).toBe(1);
  });

  it('shrinks by height when the grid is too tall', () => {
    // area 1000x500, grid 1000x1000 -> limited by height 500/1000 = 0.5
    expect(computeScale({ w: 1000, h: 500 }, { w: 1000, h: 1000 })).toBe(0.5);
  });

  it('shrinks by width when the grid is too wide', () => {
    // area 600x1000, grid 1200x1000 -> limited by width 600/1200 = 0.5
    expect(computeScale({ w: 600, h: 1000 }, { w: 1200, h: 1000 })).toBe(0.5);
  });

  it('takes the tighter of the two constraints', () => {
    // height: 400/1000 = 0.4 ; width: 900/1000 = 0.9 -> 0.4 wins
    expect(computeScale({ w: 900, h: 400 }, { w: 1000, h: 1000 })).toBeCloseTo(0.4, 12);
  });

  it('returns 1 for an unmeasured (zero-size) grid', () => {
    expect(computeScale({ w: 1000, h: 800 }, { w: 0, h: 0 })).toBe(1);
    expect(computeScale({ w: 1000, h: 800 }, { w: 500, h: 0 })).toBe(1);
  });
});
