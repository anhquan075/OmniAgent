import { describe, it, expect } from 'vitest';
import { zScore, iqrOutlier, detectAnomaly, coldStartWarning } from '../../src/utils/statistics';

describe('[SMOKE] Statistical Anomaly Detection', () => {
  describe('Z-score calculation', () => {
    it('detects normal value within threshold', () => {
      const history = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
      const testValue = 19;
      const result = zScore(testValue, history, 2.5);
      expect(result.isOutlier).toBe(false);
      expect(result.zScore).toBeCloseTo(0, 1);
    });

    it('detects outlier above threshold', () => {
      const history = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
      const result = zScore(50, history, 2.5);
      expect(result.isOutlier).toBe(true);
      expect(result.zScore).toBeGreaterThan(2.5);
    });

    it('detects outlier below negative threshold', () => {
      const history = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
      const result = zScore(2, history, 2.5);
      expect(result.isOutlier).toBe(true);
      expect(result.zScore).toBeLessThan(-2.5);
    });
  });

  describe('IQR outlier detection', () => {
    it('detects extreme high outlier', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = iqrOutlier(20, values, 1.5);
      expect(result.isOutlier).toBe(true);
    });

    it('detects extreme low outlier', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = iqrOutlier(-5, values, 1.5);
      expect(result.isOutlier).toBe(true);
    });

    it('passes normal value', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = iqrOutlier(5.5, values, 1.5);
      expect(result.isOutlier).toBe(false);
    });
  });

  describe('Combined anomaly detection', () => {
    it('flags transaction with high z-score', () => {
      const history = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
      const result = detectAnomaly(500, history, 2.0, 1.5);
      expect(result.isAnomaly).toBe(true);
      expect(result.zScoreResult.isOutlier).toBe(true);
    });

    it('flags transaction with extreme IQR', () => {
      const history = Array(20).fill(100);
      const result = detectAnomaly(1000, history, 3.0, 1.5);
      expect(result.isAnomaly).toBe(true);
    });

    it('approves normal transaction', () => {
      const history = [95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
      const result = detectAnomaly(100, history, 2.0, 1.5);
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('Cold start handling', () => {
    it('warns when insufficient history', () => {
      const result = coldStartWarning(3, 30);
      expect(result.isColdStart).toBe(true);
      expect(result.confidence).toBe('low');
    });

    it('medium confidence for moderate samples', () => {
      const result = coldStartWarning(15, 30);
      expect(result.isColdStart).toBe(true);
      expect(result.confidence).toBe('medium');
    });

    it('no warning for sufficient history', () => {
      const result = coldStartWarning(50, 30);
      expect(result.isColdStart).toBe(false);
    });
  });
});
