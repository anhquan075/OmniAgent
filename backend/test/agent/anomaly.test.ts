import { describe, it, expect } from 'vitest';
import {
  mean,
  stdDev,
  zScore,
  iqrOutlier,
  percentile,
  detectAnomaly,
  coldStartWarning
} from '../../src/utils/statistics';

describe('statistics', () => {
  describe('mean', () => {
    it('calculates mean correctly', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
      expect(mean([10, 20, 30])).toBe(20);
      expect(mean([])).toBe(0);
    });

    it('handles single value', () => {
      expect(mean([42])).toBe(42);
    });

    it('handles negative values', () => {
      expect(mean([-5, 0, 5])).toBe(0);
    });
  });

  describe('stdDev', () => {
    it('calculates sample std dev correctly', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const sd = stdDev(values, true);
      expect(sd).toBeCloseTo(2.138, 2);
    });

    it('returns 0 for single value', () => {
      expect(stdDev([42], true)).toBe(0);
    });

    it('returns 0 for identical values', () => {
      expect(stdDev([5, 5, 5, 5], true)).toBe(0);
    });

    it('uses population std dev when bessel=false', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const sampleSd = stdDev(values, true);
      const popSd = stdDev(values, false);
      expect(popSd).toBeLessThan(sampleSd);
    });
  });

  describe('percentile', () => {
    it('calculates median correctly', () => {
      const sorted = [1, 2, 3, 4, 5];
      expect(percentile(sorted, 50)).toBe(3);
    });

    it('calculates quartiles', () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(percentile(sorted, 25)).toBeCloseTo(3.25, 1);
      expect(percentile(sorted, 75)).toBeCloseTo(7.75, 1);
    });

    it('handles empty array', () => {
      expect(percentile([], 50)).toBe(0);
    });
  });

  describe('zScore', () => {
    it('detects normal value', () => {
      const history = [10, 12, 14, 16, 18];
      const result = zScore(15, history, 2.5);
      expect(result.zScore).toBeCloseTo(0.316, 2);
      expect(result.isOutlier).toBe(false);
    });

    it('detects outlier above threshold', () => {
      const history = [10, 12, 14, 16, 18];
      const result = zScore(30, history, 2.5);
      expect(result.zScore).toBeGreaterThan(2.5);
      expect(result.isOutlier).toBe(true);
    });

    it('detects outlier below threshold', () => {
      const history = [10, 12, 14, 16, 18];
      const result = zScore(2, history, 2.5);
      expect(result.zScore).toBeLessThan(-2.5);
      expect(result.isOutlier).toBe(true);
    });

    it('handles zero variance', () => {
      const history = [5, 5, 5, 5];
      const result = zScore(5, history, 2.5);
      expect(result.isOutlier).toBe(false);
    });
  });

  describe('iqrOutlier', () => {
    it('detects normal value', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = iqrOutlier(5, values, 1.5);
      expect(result.isOutlier).toBe(false);
      expect(result.q2).toBe(5.5);
    });

    it('detects extreme low outlier', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = iqrOutlier(-5, values, 1.5);
      expect(result.isOutlier).toBe(true);
      expect(result.lowerBound).toBeGreaterThan(-5);
    });

    it('detects extreme high outlier', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = iqrOutlier(20, values, 1.5);
      expect(result.isOutlier).toBe(true);
      expect(result.upperBound).toBeLessThan(20);
    });

    it('handles insufficient data', () => {
      const values = [1, 2];
      const result = iqrOutlier(100, values, 1.5);
      expect(result.isOutlier).toBe(false);
    });
  });

  describe('detectAnomaly', () => {
    it('returns combined result', () => {
      const history = [10, 12, 14, 16, 18, 20, 22, 24];
      const result = detectAnomaly(15, history);
      expect(result.isAnomaly).toBe(false);
      expect(result.zScoreResult).toBeDefined();
      expect(result.iqrResult).toBeDefined();
    });

    it('flags when z-score detects outlier', () => {
      const history = [10, 12, 14, 16, 18];
      const result = detectAnomaly(50, history, 2.0, 1.5);
      expect(result.isAnomaly).toBe(true);
      expect(result.zScoreResult.isOutlier).toBe(true);
    });

    it('flags when IQR detects outlier', () => {
      const history = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = detectAnomaly(100, history, 3.0, 1.5);
      expect(result.isAnomaly).toBe(true);
      expect(result.iqrResult.isOutlier).toBe(true);
    });
  });

  describe('coldStartWarning', () => {
    it('warns for insufficient samples', () => {
      const result = coldStartWarning(5, 30);
      expect(result.isColdStart).toBe(true);
      expect(result.confidence).toBe('low');
    });

    it('medium confidence for moderate samples', () => {
      const result = coldStartWarning(20, 30);
      expect(result.isColdStart).toBe(true);
      expect(result.confidence).toBe('medium');
    });

    it('no warning for sufficient samples', () => {
      const result = coldStartWarning(50, 30);
      expect(result.isColdStart).toBe(false);
      expect(result.confidence).toBe('high');
    });
  });
});
