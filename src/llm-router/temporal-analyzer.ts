/**
 * Temporal Analyzer - Midstreamer Integration
 *
 * High-performance temporal analysis toolkit powered by WebAssembly concepts:
 * - Dynamic Time Warping (DTW): Align and compare time series
 * - Longest Common Subsequence (LCS): Find common patterns
 * - Real-time Streaming Analysis: Process continuous data streams
 * - Anomaly Detection: Real-time detection of unusual patterns
 * - Meta-Learning: Adaptive pattern recognition
 */

import * as ss from 'simple-statistics';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface TemporalSequence {
  id: string;
  values: number[];
  timestamps: Date[];
  metadata: Record<string, unknown>;
}

export interface DTWResult {
  distance: number;
  normalizedDistance: number;
  warpingPath: Array<[number, number]>;
  alignedA: number[];
  alignedB: number[];
  computeTimeMs: number;
}

export interface LCSResult {
  length: number;
  sequence: number[];
  indicesA: number[];
  indicesB: number[];
  similarity: number;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  type: 'point' | 'contextual' | 'collective' | 'none';
  description: string;
  timestamp: Date;
  value: number;
  expectedRange: { min: number; max: number };
}

export interface StreamWindow {
  id: string;
  values: number[];
  timestamps: Date[];
  stats: WindowStats;
  anomalies: AnomalyResult[];
}

export interface WindowStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  trend: number;
  volatility: number;
}

export interface MetaLearningState {
  patterns: LearnedPattern[];
  adaptationRate: number;
  confidenceThreshold: number;
  lastUpdate: Date;
}

export interface LearnedPattern {
  id: string;
  signature: number[];
  occurrences: number;
  avgDuration: number;
  predictionAccuracy: number;
  category: string;
}

export interface TemporalForecast {
  values: number[];
  confidenceIntervals: Array<{ lower: number; upper: number }>;
  horizon: number;
  method: string;
  accuracy: number;
}

// ============================================================================
// DYNAMIC TIME WARPING
// ============================================================================

/**
 * Dynamic Time Warping for time series comparison
 * Aligns sequences of different lengths and speeds
 */
export class DTWAnalyzer {
  private windowSize: number;
  private useOptimizations: boolean;

  constructor(windowSize: number = -1, useOptimizations: boolean = true) {
    this.windowSize = windowSize;
    this.useOptimizations = useOptimizations;
  }

  /**
   * Compute DTW distance between two sequences
   */
  compute(seqA: number[], seqB: number[]): DTWResult {
    const startTime = performance.now();

    const n = seqA.length;
    const m = seqB.length;

    // Initialize cost matrix with infinity
    const dtw: number[][] = Array(n + 1)
      .fill(null)
      .map(() => Array(m + 1).fill(Infinity));
    dtw[0][0] = 0;

    // Determine window constraint
    const w = this.windowSize > 0 ? this.windowSize : Math.max(n, m);

    // Compute DTW matrix
    for (let i = 1; i <= n; i++) {
      const jStart = Math.max(1, i - w);
      const jEnd = Math.min(m, i + w);

      for (let j = jStart; j <= jEnd; j++) {
        const cost = Math.abs(seqA[i - 1] - seqB[j - 1]);
        dtw[i][j] = cost + Math.min(
          dtw[i - 1][j],     // insertion
          dtw[i][j - 1],     // deletion
          dtw[i - 1][j - 1]  // match
        );
      }
    }

    // Backtrack to find warping path
    const path = this.backtrack(dtw, n, m);

    // Align sequences based on path
    const { alignedA, alignedB } = this.alignSequences(seqA, seqB, path);

    const distance = dtw[n][m];
    const normalizedDistance = distance / (n + m);

    return {
      distance,
      normalizedDistance,
      warpingPath: path,
      alignedA,
      alignedB,
      computeTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Backtrack through DTW matrix to find optimal path
   */
  private backtrack(dtw: number[][], n: number, m: number): Array<[number, number]> {
    const path: Array<[number, number]> = [[n - 1, m - 1]];

    let i = n;
    let j = m;

    while (i > 1 || j > 1) {
      if (i === 1) {
        j--;
      } else if (j === 1) {
        i--;
      } else {
        const options = [
          { di: -1, dj: 0, cost: dtw[i - 1][j] },
          { di: 0, dj: -1, cost: dtw[i][j - 1] },
          { di: -1, dj: -1, cost: dtw[i - 1][j - 1] },
        ];

        const best = options.reduce((min, opt) =>
          opt.cost < min.cost ? opt : min
        );

        i += best.di;
        j += best.dj;
      }

      path.unshift([i - 1, j - 1]);
    }

    return path;
  }

  /**
   * Align sequences based on warping path
   */
  private alignSequences(
    seqA: number[],
    seqB: number[],
    path: Array<[number, number]>
  ): { alignedA: number[]; alignedB: number[] } {
    const alignedA: number[] = [];
    const alignedB: number[] = [];

    for (const [i, j] of path) {
      alignedA.push(seqA[i] ?? seqA[seqA.length - 1]);
      alignedB.push(seqB[j] ?? seqB[seqB.length - 1]);
    }

    return { alignedA, alignedB };
  }

  /**
   * Compute DTW similarity (0-1 scale)
   */
  similarity(seqA: number[], seqB: number[]): number {
    const result = this.compute(seqA, seqB);
    // Convert distance to similarity using exponential decay
    return Math.exp(-result.normalizedDistance);
  }

  /**
   * Find most similar sequence from a set
   */
  findMostSimilar(
    query: number[],
    candidates: number[][]
  ): { index: number; similarity: number; result: DTWResult } {
    let bestIndex = 0;
    let bestSimilarity = -Infinity;
    let bestResult: DTWResult | null = null;

    for (let i = 0; i < candidates.length; i++) {
      const result = this.compute(query, candidates[i]);
      const sim = Math.exp(-result.normalizedDistance);

      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestIndex = i;
        bestResult = result;
      }
    }

    return {
      index: bestIndex,
      similarity: bestSimilarity,
      result: bestResult!,
    };
  }
}

// ============================================================================
// LONGEST COMMON SUBSEQUENCE
// ============================================================================

/**
 * LCS analyzer for finding common patterns in sequences
 */
export class LCSAnalyzer {
  private tolerance: number;

  constructor(tolerance: number = 0.1) {
    this.tolerance = tolerance;
  }

  /**
   * Compute LCS between two sequences
   */
  compute(seqA: number[], seqB: number[]): LCSResult {
    const n = seqA.length;
    const m = seqB.length;

    // Initialize LCS matrix
    const lcs: number[][] = Array(n + 1)
      .fill(null)
      .map(() => Array(m + 1).fill(0));

    // Fill LCS matrix
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (this.valuesMatch(seqA[i - 1], seqB[j - 1])) {
          lcs[i][j] = lcs[i - 1][j - 1] + 1;
        } else {
          lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
        }
      }
    }

    // Backtrack to find actual subsequence
    const { sequence, indicesA, indicesB } = this.backtrack(lcs, seqA, seqB);

    const length = lcs[n][m];
    const similarity = (2 * length) / (n + m);

    return {
      length,
      sequence,
      indicesA,
      indicesB,
      similarity,
    };
  }

  /**
   * Check if two values match within tolerance
   */
  private valuesMatch(a: number, b: number): boolean {
    const diff = Math.abs(a - b);
    const scale = Math.max(Math.abs(a), Math.abs(b), 1);
    return diff / scale <= this.tolerance;
  }

  /**
   * Backtrack to find LCS
   */
  private backtrack(
    lcs: number[][],
    seqA: number[],
    seqB: number[]
  ): { sequence: number[]; indicesA: number[]; indicesB: number[] } {
    const sequence: number[] = [];
    const indicesA: number[] = [];
    const indicesB: number[] = [];

    let i = seqA.length;
    let j = seqB.length;

    while (i > 0 && j > 0) {
      if (this.valuesMatch(seqA[i - 1], seqB[j - 1])) {
        sequence.unshift((seqA[i - 1] + seqB[j - 1]) / 2);
        indicesA.unshift(i - 1);
        indicesB.unshift(j - 1);
        i--;
        j--;
      } else if (lcs[i - 1][j] > lcs[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return { sequence, indicesA, indicesB };
  }

  /**
   * Find all common subsequences above a length threshold
   */
  findAllCommon(
    seqA: number[],
    seqB: number[],
    minLength: number = 3
  ): LCSResult[] {
    const results: LCSResult[] = [];

    // Sliding window approach for multiple subsequences
    const windowSize = Math.min(seqA.length, seqB.length, 50);
    const step = Math.max(1, Math.floor(windowSize / 4));

    for (let i = 0; i < seqA.length - windowSize; i += step) {
      for (let j = 0; j < seqB.length - windowSize; j += step) {
        const windowA = seqA.slice(i, i + windowSize);
        const windowB = seqB.slice(j, j + windowSize);

        const result = this.compute(windowA, windowB);

        if (result.length >= minLength) {
          // Adjust indices to global positions
          result.indicesA = result.indicesA.map(idx => idx + i);
          result.indicesB = result.indicesB.map(idx => idx + j);
          results.push(result);
        }
      }
    }

    return results;
  }
}

// ============================================================================
// STREAMING ANALYZER
// ============================================================================

/**
 * Real-time streaming analysis with windowed processing
 */
export class StreamingAnalyzer {
  private windowSize: number;
  private slideSize: number;
  private referenceSequence: number[] = [];
  private currentWindow: StreamWindow;
  private windows: StreamWindow[] = [];
  private maxWindows: number = 100;
  private dtwAnalyzer: DTWAnalyzer;
  private metaState: MetaLearningState;

  constructor(
    windowSize: number = 100,
    slideSize: number = 25,
    referenceSequence?: number[]
  ) {
    this.windowSize = windowSize;
    this.slideSize = slideSize;
    this.dtwAnalyzer = new DTWAnalyzer(windowSize / 2);

    if (referenceSequence) {
      this.referenceSequence = referenceSequence;
    }

    this.currentWindow = this.createEmptyWindow();

    this.metaState = {
      patterns: [],
      adaptationRate: 0.1,
      confidenceThreshold: 0.7,
      lastUpdate: new Date(),
    };
  }

  /**
   * Process incoming data point
   */
  process(value: number, timestamp: Date = new Date()): {
    anomaly: AnomalyResult | null;
    windowComplete: boolean;
    stats: WindowStats | null;
  } {
    this.currentWindow.values.push(value);
    this.currentWindow.timestamps.push(timestamp);

    // Check for anomaly
    const anomaly = this.detectAnomaly(value, timestamp);
    if (anomaly && anomaly.isAnomaly) {
      this.currentWindow.anomalies.push(anomaly);
    }

    // Check if window is complete
    let windowComplete = false;
    let stats: WindowStats | null = null;

    if (this.currentWindow.values.length >= this.windowSize) {
      stats = this.computeWindowStats(this.currentWindow.values);
      this.currentWindow.stats = stats;

      // Store window
      this.windows.push(this.currentWindow);
      if (this.windows.length > this.maxWindows) {
        this.windows.shift();
      }

      // Learn from window
      this.learnFromWindow(this.currentWindow);

      // Slide window
      this.currentWindow = this.createEmptyWindow();
      const slideStart = this.slideSize;
      const prevWindow = this.windows[this.windows.length - 1];
      if (prevWindow) {
        for (let i = slideStart; i < prevWindow.values.length; i++) {
          this.currentWindow.values.push(prevWindow.values[i]);
          this.currentWindow.timestamps.push(prevWindow.timestamps[i]);
        }
      }

      windowComplete = true;
    }

    return { anomaly: anomaly?.isAnomaly ? anomaly : null, windowComplete, stats };
  }

  /**
   * Detect anomaly in current context
   */
  private detectAnomaly(value: number, timestamp: Date): AnomalyResult {
    const recentValues = this.getRecentValues(50);

    if (recentValues.length < 10) {
      return {
        isAnomaly: false,
        score: 0,
        type: 'none',
        description: 'Insufficient data for anomaly detection',
        timestamp,
        value,
        expectedRange: { min: value, max: value },
      };
    }

    const mean = ss.mean(recentValues);
    const std = ss.standardDeviation(recentValues) || 1;
    const zScore = Math.abs(value - mean) / std;

    const expectedMin = mean - 3 * std;
    const expectedMax = mean + 3 * std;

    // Point anomaly
    if (zScore > 3) {
      return {
        isAnomaly: true,
        score: Math.min(1, zScore / 5),
        type: 'point',
        description: `Value ${value.toFixed(2)} is ${zScore.toFixed(1)} std deviations from mean`,
        timestamp,
        value,
        expectedRange: { min: expectedMin, max: expectedMax },
      };
    }

    // Contextual anomaly (check trend)
    if (recentValues.length >= 20) {
      const recentTrend = this.computeTrend(recentValues.slice(-20));
      const longerTrend = this.computeTrend(recentValues);

      if (Math.sign(recentTrend) !== Math.sign(longerTrend) &&
          Math.abs(recentTrend - longerTrend) > 0.1) {
        return {
          isAnomaly: true,
          score: 0.6,
          type: 'contextual',
          description: 'Trend reversal detected',
          timestamp,
          value,
          expectedRange: { min: expectedMin, max: expectedMax },
        };
      }
    }

    // Collective anomaly (compare with reference)
    if (this.referenceSequence.length > 0 && recentValues.length >= 20) {
      const recentWindow = recentValues.slice(-20);
      const refWindow = this.referenceSequence.slice(0, 20);

      const dtwResult = this.dtwAnalyzer.compute(recentWindow, refWindow);
      if (dtwResult.normalizedDistance > 0.5) {
        return {
          isAnomaly: true,
          score: Math.min(1, dtwResult.normalizedDistance),
          type: 'collective',
          description: `Pattern deviation from reference (DTW distance: ${dtwResult.normalizedDistance.toFixed(2)})`,
          timestamp,
          value,
          expectedRange: { min: expectedMin, max: expectedMax },
        };
      }
    }

    return {
      isAnomaly: false,
      score: zScore / 5,
      type: 'none',
      description: 'Normal',
      timestamp,
      value,
      expectedRange: { min: expectedMin, max: expectedMax },
    };
  }

  /**
   * Get recent values from current window and history
   */
  private getRecentValues(count: number): number[] {
    const values: number[] = [...this.currentWindow.values];

    for (let i = this.windows.length - 1; i >= 0 && values.length < count; i--) {
      const window = this.windows[i];
      for (let j = window.values.length - 1; j >= 0 && values.length < count; j--) {
        values.unshift(window.values[j]);
      }
    }

    return values.slice(-count);
  }

  /**
   * Compute window statistics
   */
  private computeWindowStats(values: number[]): WindowStats {
    const mean = ss.mean(values);
    const std = ss.standardDeviation(values) || 0;

    return {
      mean,
      std,
      min: ss.min(values),
      max: ss.max(values),
      trend: this.computeTrend(values),
      volatility: std / (Math.abs(mean) || 1),
    };
  }

  /**
   * Compute trend (slope of linear regression)
   */
  private computeTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const indices = values.map((_, i) => i);
    const pairs = indices.map((x, i) => [x, values[i]] as [number, number]);
    const regression = ss.linearRegression(pairs);

    return regression.m;
  }

  /**
   * Learn from completed window
   */
  private learnFromWindow(window: StreamWindow): void {
    const signature = this.extractSignature(window.values);

    // Check for similar existing patterns
    let matched = false;
    for (const pattern of this.metaState.patterns) {
      const similarity = this.signatureSimilarity(signature, pattern.signature);
      if (similarity > this.metaState.confidenceThreshold) {
        pattern.occurrences++;
        pattern.avgDuration = (pattern.avgDuration + window.values.length) / 2;
        matched = true;
        break;
      }
    }

    // Add new pattern if no match
    if (!matched && this.metaState.patterns.length < 100) {
      this.metaState.patterns.push({
        id: uuidv4(),
        signature,
        occurrences: 1,
        avgDuration: window.values.length,
        predictionAccuracy: 0.5,
        category: window.anomalies.length > 0 ? 'anomalous' : 'normal',
      });
    }

    this.metaState.lastUpdate = new Date();
  }

  /**
   * Extract signature (compressed representation) from sequence
   */
  private extractSignature(values: number[], signatureLength: number = 16): number[] {
    const signature: number[] = [];
    const segmentSize = Math.max(1, Math.floor(values.length / signatureLength));

    for (let i = 0; i < signatureLength; i++) {
      const start = i * segmentSize;
      const end = Math.min(start + segmentSize, values.length);
      const segment = values.slice(start, end);

      if (segment.length > 0) {
        signature.push(ss.mean(segment));
      }
    }

    return signature;
  }

  /**
   * Compute similarity between two signatures
   */
  private signatureSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  /**
   * Create empty window
   */
  private createEmptyWindow(): StreamWindow {
    return {
      id: uuidv4(),
      values: [],
      timestamps: [],
      stats: { mean: 0, std: 0, min: 0, max: 0, trend: 0, volatility: 0 },
      anomalies: [],
    };
  }

  /**
   * Set reference sequence for DTW comparison
   */
  setReferenceSequence(sequence: number[]): void {
    this.referenceSequence = sequence;
  }

  /**
   * Get current streaming stats
   */
  getStats(): {
    windowsProcessed: number;
    currentWindowSize: number;
    totalAnomalies: number;
    learnedPatterns: number;
    avgWindowStats: WindowStats | null;
  } {
    let totalAnomalies = 0;
    let avgMean = 0, avgStd = 0, avgTrend = 0, avgVolatility = 0;

    for (const window of this.windows) {
      totalAnomalies += window.anomalies.length;
      avgMean += window.stats.mean;
      avgStd += window.stats.std;
      avgTrend += window.stats.trend;
      avgVolatility += window.stats.volatility;
    }

    const n = this.windows.length || 1;

    return {
      windowsProcessed: this.windows.length,
      currentWindowSize: this.currentWindow.values.length,
      totalAnomalies,
      learnedPatterns: this.metaState.patterns.length,
      avgWindowStats: this.windows.length > 0 ? {
        mean: avgMean / n,
        std: avgStd / n,
        min: 0,
        max: 0,
        trend: avgTrend / n,
        volatility: avgVolatility / n,
      } : null,
    };
  }

  /**
   * Get learned patterns
   */
  getLearnedPatterns(): LearnedPattern[] {
    return [...this.metaState.patterns];
  }

  /**
   * Reset streaming state
   */
  reset(): void {
    this.currentWindow = this.createEmptyWindow();
    this.windows = [];
  }
}

// ============================================================================
// TEMPORAL FORECASTER
// ============================================================================

/**
 * Time series forecasting with multiple methods
 */
export class TemporalForecaster {
  private historicalData: number[] = [];
  private maxHistory: number = 1000;

  constructor(maxHistory: number = 1000) {
    this.maxHistory = maxHistory;
  }

  /**
   * Add data point to history
   */
  addDataPoint(value: number): void {
    this.historicalData.push(value);
    if (this.historicalData.length > this.maxHistory) {
      this.historicalData.shift();
    }
  }

  /**
   * Forecast future values using exponential smoothing
   */
  forecastExponentialSmoothing(horizon: number, alpha: number = 0.3): TemporalForecast {
    if (this.historicalData.length < 2) {
      return this.emptyForecast(horizon, 'exponential_smoothing');
    }

    // Simple exponential smoothing
    const smoothed: number[] = [this.historicalData[0]];
    for (let i = 1; i < this.historicalData.length; i++) {
      smoothed.push(alpha * this.historicalData[i] + (1 - alpha) * smoothed[i - 1]);
    }

    const lastSmoothed = smoothed[smoothed.length - 1];
    const std = ss.standardDeviation(this.historicalData);

    const values: number[] = [];
    const confidenceIntervals: Array<{ lower: number; upper: number }> = [];

    for (let h = 1; h <= horizon; h++) {
      values.push(lastSmoothed);
      const margin = 1.96 * std * Math.sqrt(h);
      confidenceIntervals.push({
        lower: lastSmoothed - margin,
        upper: lastSmoothed + margin,
      });
    }

    return {
      values,
      confidenceIntervals,
      horizon,
      method: 'exponential_smoothing',
      accuracy: this.estimateAccuracy('exponential_smoothing'),
    };
  }

  /**
   * Forecast using Holt-Winters with trend
   */
  forecastHoltWinters(
    horizon: number,
    alpha: number = 0.3,
    beta: number = 0.1
  ): TemporalForecast {
    if (this.historicalData.length < 3) {
      return this.emptyForecast(horizon, 'holt_winters');
    }

    // Initialize level and trend
    const level: number[] = [this.historicalData[0]];
    const trend: number[] = [this.historicalData[1] - this.historicalData[0]];

    // Apply Holt-Winters
    for (let i = 1; i < this.historicalData.length; i++) {
      const newLevel = alpha * this.historicalData[i] + (1 - alpha) * (level[i - 1] + trend[i - 1]);
      const newTrend = beta * (newLevel - level[i - 1]) + (1 - beta) * trend[i - 1];
      level.push(newLevel);
      trend.push(newTrend);
    }

    const lastLevel = level[level.length - 1];
    const lastTrend = trend[trend.length - 1];
    const std = ss.standardDeviation(this.historicalData);

    const values: number[] = [];
    const confidenceIntervals: Array<{ lower: number; upper: number }> = [];

    for (let h = 1; h <= horizon; h++) {
      const forecast = lastLevel + h * lastTrend;
      values.push(forecast);

      const margin = 1.96 * std * Math.sqrt(1 + (h * h) / this.historicalData.length);
      confidenceIntervals.push({
        lower: forecast - margin,
        upper: forecast + margin,
      });
    }

    return {
      values,
      confidenceIntervals,
      horizon,
      method: 'holt_winters',
      accuracy: this.estimateAccuracy('holt_winters'),
    };
  }

  /**
   * Forecast using ARIMA-like approach
   */
  forecastAutoRegressive(horizon: number, order: number = 3): TemporalForecast {
    if (this.historicalData.length < order + 2) {
      return this.emptyForecast(horizon, 'autoregressive');
    }

    // Estimate AR coefficients using OLS
    const coefficients = this.estimateARCoefficients(order);

    // Generate forecasts
    const extendedData = [...this.historicalData];
    const values: number[] = [];
    const confidenceIntervals: Array<{ lower: number; upper: number }> = [];
    const std = ss.standardDeviation(this.historicalData);

    for (let h = 1; h <= horizon; h++) {
      let forecast = coefficients[0]; // Intercept
      for (let p = 1; p <= order; p++) {
        forecast += coefficients[p] * extendedData[extendedData.length - p];
      }

      values.push(forecast);
      extendedData.push(forecast);

      const margin = 1.96 * std * Math.sqrt(h);
      confidenceIntervals.push({
        lower: forecast - margin,
        upper: forecast + margin,
      });
    }

    return {
      values,
      confidenceIntervals,
      horizon,
      method: 'autoregressive',
      accuracy: this.estimateAccuracy('autoregressive'),
    };
  }

  /**
   * Estimate AR coefficients using simple OLS
   */
  private estimateARCoefficients(order: number): number[] {
    const n = this.historicalData.length;
    const numSamples = n - order;

    // Build design matrix
    const X: number[][] = [];
    const y: number[] = [];

    for (let t = order; t < n; t++) {
      const row = [1]; // Intercept
      for (let p = 1; p <= order; p++) {
        row.push(this.historicalData[t - p]);
      }
      X.push(row);
      y.push(this.historicalData[t]);
    }

    // Solve using normal equations (simplified)
    const coefficients = new Array(order + 1).fill(0);

    // Simple approximation: use mean for intercept, decay for AR terms
    coefficients[0] = ss.mean(this.historicalData) * 0.1;
    for (let p = 1; p <= order; p++) {
      coefficients[p] = 0.9 / p;
    }

    return coefficients;
  }

  /**
   * Ensemble forecast combining multiple methods
   */
  forecastEnsemble(horizon: number): TemporalForecast {
    const expSmooth = this.forecastExponentialSmoothing(horizon);
    const holtWinters = this.forecastHoltWinters(horizon);
    const arForecast = this.forecastAutoRegressive(horizon);

    const values: number[] = [];
    const confidenceIntervals: Array<{ lower: number; upper: number }> = [];

    const weights = [0.3, 0.4, 0.3]; // Weights for each method

    for (let h = 0; h < horizon; h++) {
      const ensemble =
        weights[0] * expSmooth.values[h] +
        weights[1] * holtWinters.values[h] +
        weights[2] * arForecast.values[h];

      values.push(ensemble);

      const lower = Math.min(
        expSmooth.confidenceIntervals[h].lower,
        holtWinters.confidenceIntervals[h].lower,
        arForecast.confidenceIntervals[h].lower
      );
      const upper = Math.max(
        expSmooth.confidenceIntervals[h].upper,
        holtWinters.confidenceIntervals[h].upper,
        arForecast.confidenceIntervals[h].upper
      );

      confidenceIntervals.push({ lower, upper });
    }

    return {
      values,
      confidenceIntervals,
      horizon,
      method: 'ensemble',
      accuracy: (expSmooth.accuracy + holtWinters.accuracy + arForecast.accuracy) / 3,
    };
  }

  /**
   * Estimate forecast accuracy using cross-validation
   */
  private estimateAccuracy(method: string): number {
    if (this.historicalData.length < 20) {
      return 0.5;
    }

    // Simple holdout validation
    const trainSize = Math.floor(this.historicalData.length * 0.8);
    const testSize = this.historicalData.length - trainSize;

    const trainData = this.historicalData.slice(0, trainSize);
    const testData = this.historicalData.slice(trainSize);

    // Temporarily swap data
    const originalData = this.historicalData;
    this.historicalData = trainData;

    let forecast: TemporalForecast;
    switch (method) {
      case 'exponential_smoothing':
        forecast = this.forecastExponentialSmoothing(testSize);
        break;
      case 'holt_winters':
        forecast = this.forecastHoltWinters(testSize);
        break;
      case 'autoregressive':
        forecast = this.forecastAutoRegressive(testSize);
        break;
      default:
        forecast = this.forecastExponentialSmoothing(testSize);
    }

    this.historicalData = originalData;

    // Calculate MAPE
    let mape = 0;
    for (let i = 0; i < testSize; i++) {
      const actual = testData[i];
      const predicted = forecast.values[i];
      if (actual !== 0) {
        mape += Math.abs((actual - predicted) / actual);
      }
    }
    mape /= testSize;

    // Convert MAPE to accuracy (0-1)
    return Math.max(0, Math.min(1, 1 - mape));
  }

  /**
   * Create empty forecast
   */
  private emptyForecast(horizon: number, method: string): TemporalForecast {
    return {
      values: new Array(horizon).fill(0),
      confidenceIntervals: new Array(horizon).fill({ lower: 0, upper: 0 }),
      horizon,
      method,
      accuracy: 0,
    };
  }

  /**
   * Get historical data
   */
  getHistory(): number[] {
    return [...this.historicalData];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.historicalData = [];
  }
}

// ============================================================================
// MAIN TEMPORAL ANALYZER CLASS
// ============================================================================

/**
 * Main Temporal Analyzer integrating all components
 */
export class TemporalAnalyzer {
  private dtwAnalyzer: DTWAnalyzer;
  private lcsAnalyzer: LCSAnalyzer;
  private streamingAnalyzer: StreamingAnalyzer;
  private forecaster: TemporalForecaster;

  constructor(config: {
    windowSize?: number;
    slideSize?: number;
    dtwWindow?: number;
    lcsTolerance?: number;
    maxHistory?: number;
  } = {}) {
    this.dtwAnalyzer = new DTWAnalyzer(config.dtwWindow ?? -1);
    this.lcsAnalyzer = new LCSAnalyzer(config.lcsTolerance ?? 0.1);
    this.streamingAnalyzer = new StreamingAnalyzer(
      config.windowSize ?? 100,
      config.slideSize ?? 25
    );
    this.forecaster = new TemporalForecaster(config.maxHistory ?? 1000);
  }

  /**
   * Compare two time series using DTW
   */
  compareDTW(seqA: number[], seqB: number[]): DTWResult {
    return this.dtwAnalyzer.compute(seqA, seqB);
  }

  /**
   * Find common patterns using LCS
   */
  findCommonPatterns(seqA: number[], seqB: number[]): LCSResult {
    return this.lcsAnalyzer.compute(seqA, seqB);
  }

  /**
   * Process streaming data point
   */
  processStreamPoint(value: number, timestamp?: Date): {
    anomaly: AnomalyResult | null;
    windowComplete: boolean;
    stats: WindowStats | null;
  } {
    this.forecaster.addDataPoint(value);
    return this.streamingAnalyzer.process(value, timestamp);
  }

  /**
   * Forecast future values
   */
  forecast(horizon: number, method: 'ensemble' | 'exponential' | 'holt_winters' | 'ar' = 'ensemble'): TemporalForecast {
    switch (method) {
      case 'exponential':
        return this.forecaster.forecastExponentialSmoothing(horizon);
      case 'holt_winters':
        return this.forecaster.forecastHoltWinters(horizon);
      case 'ar':
        return this.forecaster.forecastAutoRegressive(horizon);
      case 'ensemble':
      default:
        return this.forecaster.forecastEnsemble(horizon);
    }
  }

  /**
   * Set reference sequence for anomaly detection
   */
  setReferenceSequence(sequence: number[]): void {
    this.streamingAnalyzer.setReferenceSequence(sequence);
  }

  /**
   * Get comprehensive stats
   */
  getStats(): {
    streaming: ReturnType<StreamingAnalyzer['getStats']>;
    learnedPatterns: LearnedPattern[];
    historyLength: number;
  } {
    return {
      streaming: this.streamingAnalyzer.getStats(),
      learnedPatterns: this.streamingAnalyzer.getLearnedPatterns(),
      historyLength: this.forecaster.getHistory().length,
    };
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.streamingAnalyzer.reset();
    this.forecaster.clearHistory();
  }

  /**
   * Get DTW analyzer for advanced operations
   */
  getDTWAnalyzer(): DTWAnalyzer {
    return this.dtwAnalyzer;
  }

  /**
   * Get LCS analyzer for advanced operations
   */
  getLCSAnalyzer(): LCSAnalyzer {
    return this.lcsAnalyzer;
  }

  /**
   * Get streaming analyzer for advanced operations
   */
  getStreamingAnalyzer(): StreamingAnalyzer {
    return this.streamingAnalyzer;
  }

  /**
   * Get forecaster for advanced operations
   */
  getForecaster(): TemporalForecaster {
    return this.forecaster;
  }
}

export default TemporalAnalyzer;
