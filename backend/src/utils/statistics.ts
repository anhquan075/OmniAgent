/**
 * Statistical utilities for anomaly detection
 * Implements Z-score and IQR (Interquartile Range) outlier detection
 */

export interface ZScoreResult {
  zScore: number;
  isOutlier: boolean;
  threshold: number;
  probability: number;
}

export interface IQRResult {
  q1: number;
  q2: number; // median
  q3: number;
  iqr: number;
  lowerBound: number;
  upperBound: number;
  isOutlier: boolean;
}

export interface PercentileResult {
  percentile: number;
  value: number;
}

/**
 * Calculate mean (average) of values
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculate standard deviation
 * @param bessel - Use Bessel's correction (n-1) for sample std dev
 */
export function stdDev(values: number[], bessel: boolean = true): number {
  if (values.length < 2) return 0;
  
  const avg = mean(values);
  const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
  const divisor = bessel ? values.length - 1 : values.length;
  return Math.sqrt(squaredDiffs.reduce((acc, val) => acc + val, 0) / divisor);
}

/**
 * Calculate Z-score for a value
 * @param value - The value to score
 * @param values - Historical values for population statistics
 * @param threshold - Z-score threshold for outlier detection (default: 2.5)
 */
export function zScore(value: number, values: number[], threshold: number = 2.5): ZScoreResult {
  const historicalMean = mean(values);
  const historicalStd = stdDev(values, true);
  
  if (historicalStd === 0) {
    // No variance - all values are the same
    const isOutlier = value !== historicalMean;
    return {
      zScore: value === historicalMean ? 0 : (value > historicalMean ? Infinity : -Infinity),
      isOutlier,
      threshold,
      probability: isOutlier ? 0 : 1
    };
  }
  
  const zScore = (value - historicalMean) / historicalStd;
  const absZScore = Math.abs(zScore);
  
  // Two-tailed probability from Z-score
  // Using approximation: P(|Z| < z) = erf(z / sqrt(2))
  // Probability of being an outlier = 2 * (1 - Phi(|z|))
  const probability = 2 * (1 - normalCDF(absZScore));
  
  return {
    zScore,
    isOutlier: absZScore > threshold,
    threshold,
    probability
  };
}

/**
 * Calculate IQR (Interquartile Range) outlier detection
 * @param value - The value to check
 * @param values - Historical values
 * @param k - IQR multiplier (default: 1.5 for mild, 3 for extreme)
 */
export function iqrOutlier(value: number, values: number[], k: number = 1.5): IQRResult {
  if (values.length < 4) {
    // Not enough data for IQR
    const avg = mean(values);
    return {
      q1: avg,
      q2: avg,
      q3: avg,
      iqr: 0,
      lowerBound: avg,
      upperBound: avg,
      isOutlier: false
    };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q2 = percentile(sorted, 50);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  
  const lowerBound = q1 - k * iqr;
  const upperBound = q3 + k * iqr;
  const isOutlier = value < lowerBound || value > upperBound;
  
  return {
    q1,
    q2,
    q3,
    iqr,
    lowerBound,
    upperBound,
    isOutlier
  };
}

/**
 * Calculate percentile of sorted array
 * @param sortedValues - Pre-sorted array
 * @param p - Percentile (0-100)
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  
  if (lower === upper) return sortedValues[lower];
  
  const fraction = index - lower;
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

/**
 * Normal cumulative distribution function (CDF)
 * Approximation using error function
 */
export function normalCDF(z: number): number {
  // Approximation of Phi(z) = (1 + erf(z / sqrt(2))) / 2
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);
  
  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  
  return 0.5 * (1.0 + sign * y);
}

/**
 * Combined anomaly detection using both Z-score and IQR
 * Returns true if EITHER method detects an outlier
 */
export interface CombinedAnomalyResult {
  isAnomaly: boolean;
  zScoreResult: ZScoreResult;
  iqrResult: IQRResult;
  combinedReason: string;
}

/**
 * Detect anomalies using both Z-score and IQR methods
 * @param value - Current value to check
 * @param historicalValues - Historical baseline values
 * @param zThreshold - Z-score threshold (default: 2.5)
 * @param iqrK - IQR multiplier (default: 1.5)
 */
export function detectAnomaly(
  value: number,
  historicalValues: number[],
  zThreshold: number = 2.5,
  iqrK: number = 1.5
): CombinedAnomalyResult {
  const zResult = zScore(value, historicalValues, zThreshold);
  const iqrResult = iqrOutlier(value, historicalValues, iqrK);
  
  const isAnomaly = zResult.isOutlier || iqrResult.isOutlier;
  
  let reason = '';
  if (isAnomaly) {
    if (zResult.isOutlier && iqrResult.isOutlier) {
      reason = `Double confirmation: Z-score ${zResult.zScore.toFixed(2)} exceeds ${zThreshold} and value ${value} outside IQR [${iqrResult.lowerBound.toFixed(2)}, ${iqrResult.upperBound.toFixed(2)}]`;
    } else if (zResult.isOutlier) {
      reason = `Z-score ${zResult.zScore.toFixed(2)} exceeds threshold ${zThreshold} (${(zResult.probability * 100).toFixed(2)}% probability of being random)`;
    } else {
      reason = `Value ${value} outside IQR bounds [${iqrResult.lowerBound.toFixed(2)}, ${iqrResult.upperBound.toFixed(2)}]`;
    }
  } else {
    reason = `Value ${value} within normal bounds (Z=${zResult.zScore.toFixed(2)}, IQR bounds=[${iqrResult.lowerBound.toFixed(2)}, ${iqrResult.upperBound.toFixed(2)}])`;
  }
  
  return {
    isAnomaly,
    zScoreResult: zResult,
    iqrResult: iqrResult,
    combinedReason: reason
  };
}

/**
 * Cold-start detection when insufficient historical data
 * Returns anomaly=true if we have too few samples for reliable detection
 */
export function coldStartWarning(sampleSize: number, minSamples: number = 30): {
  isColdStart: boolean;
  confidence: 'low' | 'medium' | 'high';
  message: string;
} {
  if (sampleSize < minSamples) {
    const confidence = sampleSize < 10 ? 'low' : 'medium';
    return {
      isColdStart: true,
      confidence,
      message: `Cold-start: only ${sampleSize} samples (recommended: ${minSamples})`
    };
  }
  
  return {
    isColdStart: false,
    confidence: 'high',
    message: 'Sufficient historical data for reliable detection'
  };
}
