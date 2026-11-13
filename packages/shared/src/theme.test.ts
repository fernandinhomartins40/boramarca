import { describe, expect, it } from 'vitest';
import { colors, contrastPairs, contrastRatio, largeTextPairs } from './theme';

describe('theme contrast (WCAG AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const [fg, bg] of contrastPairs) {
      it(`${scheme}: ${fg} on ${bg} >= 4.5`, () => {
        expect(contrastRatio(colors[scheme][fg], colors[scheme][bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  for (const [fg, bg] of largeTextPairs) {
    it(`large title ${fg} on ${bg} >= 3`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(3);
    });
  }

  it('matches known reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
