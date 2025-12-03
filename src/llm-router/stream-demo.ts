/**
 * Streaming Analysis Demo
 *
 * Demonstrates real-time streaming analysis with:
 * - DTW (Dynamic Time Warping) pattern matching
 * - Anomaly detection
 * - Meta-learning for pattern recognition
 * - Time series forecasting
 */

import { TemporalAnalyzer } from './temporal-analyzer.js';

async function runStreamingDemo(): Promise<void> {
  console.log('='.repeat(70));
  console.log('  Real-Time Streaming Analysis Demo');
  console.log('  Powered by Midstreamer Temporal Analysis');
  console.log('='.repeat(70));
  console.log();

  // Initialize temporal analyzer
  const analyzer = new TemporalAnalyzer({
    windowSize: 50,
    slideSize: 10,
    dtwWindow: 25,
    lcsTolerance: 0.1,
    maxHistory: 500,
  });

  // Set reference sequence for anomaly detection
  const referencePattern = generateSinusoidalPattern(50, 10, 0.5);
  analyzer.setReferenceSequence(referencePattern);

  console.log('Reference pattern set (sinusoidal with noise)');
  console.log();

  // Generate streaming data with anomalies
  console.log('Streaming Data Analysis:');
  console.log('-'.repeat(70));

  const totalPoints = 200;
  let anomalyCount = 0;
  let windowCount = 0;

  for (let i = 0; i < totalPoints; i++) {
    // Generate data point
    let value: number;

    if (i >= 80 && i <= 90) {
      // Inject point anomaly
      value = 50 + Math.random() * 20;
    } else if (i >= 130 && i <= 150) {
      // Inject trend change
      value = 10 + (i - 130) * 0.8 + Math.random() * 2;
    } else {
      // Normal sinusoidal pattern
      value = Math.sin(i * 0.2) * 10 + 15 + (Math.random() - 0.5) * 3;
    }

    // Process point
    const result = analyzer.processStreamPoint(value, new Date(Date.now() + i * 1000));

    if (result.anomaly) {
      anomalyCount++;
      console.log(
        `[t=${i.toString().padStart(3)}] ANOMALY: ${result.anomaly.type} ` +
        `(score: ${result.anomaly.score.toFixed(2)}) - ${result.anomaly.description}`
      );
    }

    if (result.windowComplete) {
      windowCount++;
      console.log(
        `[t=${i.toString().padStart(3)}] Window ${windowCount} complete: ` +
        `mean=${result.stats!.mean.toFixed(2)}, std=${result.stats!.std.toFixed(2)}, ` +
        `trend=${result.stats!.trend.toFixed(4)}`
      );
    }

    // Simulate real-time delay
    if (i % 50 === 49) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  console.log();
  console.log('-'.repeat(70));
  console.log('Streaming Summary:');
  const stats = analyzer.getStats();
  console.log(`  Total Points: ${totalPoints}`);
  console.log(`  Windows Processed: ${stats.streaming.windowsProcessed}`);
  console.log(`  Total Anomalies: ${stats.streaming.totalAnomalies}`);
  console.log(`  Learned Patterns: ${stats.streaming.learnedPatterns}`);

  if (stats.streaming.avgWindowStats) {
    console.log(`  Avg Mean: ${stats.streaming.avgWindowStats.mean.toFixed(2)}`);
    console.log(`  Avg Std: ${stats.streaming.avgWindowStats.std.toFixed(2)}`);
    console.log(`  Avg Trend: ${stats.streaming.avgWindowStats.trend.toFixed(4)}`);
    console.log(`  Avg Volatility: ${stats.streaming.avgWindowStats.volatility.toFixed(4)}`);
  }

  // DTW Comparison Demo
  console.log();
  console.log('='.repeat(70));
  console.log('  Dynamic Time Warping (DTW) Demo');
  console.log('='.repeat(70));
  console.log();

  const seqA = generateSinusoidalPattern(30, 10, 0.2);
  const seqB = generateSinusoidalPattern(35, 10, 0.2).map(v => v * 1.1); // Stretched version
  const seqC = generateRandomPattern(30, 5, 20);

  console.log('Comparing sequences:');
  console.log('  SeqA: Sinusoidal (30 points)');
  console.log('  SeqB: Stretched sinusoidal (35 points)');
  console.log('  SeqC: Random (30 points)');
  console.log();

  const dtwAB = analyzer.compareDTW(seqA, seqB);
  const dtwAC = analyzer.compareDTW(seqA, seqC);

  console.log('DTW Results:');
  console.log(`  A vs B (similar patterns):`);
  console.log(`    Distance: ${dtwAB.distance.toFixed(2)}`);
  console.log(`    Normalized: ${dtwAB.normalizedDistance.toFixed(4)}`);
  console.log(`    Similarity: ${(Math.exp(-dtwAB.normalizedDistance) * 100).toFixed(1)}%`);
  console.log(`    Compute Time: ${dtwAB.computeTimeMs.toFixed(2)}ms`);
  console.log(`    Warping Path Length: ${dtwAB.warpingPath.length}`);

  console.log(`  A vs C (different patterns):`);
  console.log(`    Distance: ${dtwAC.distance.toFixed(2)}`);
  console.log(`    Normalized: ${dtwAC.normalizedDistance.toFixed(4)}`);
  console.log(`    Similarity: ${(Math.exp(-dtwAC.normalizedDistance) * 100).toFixed(1)}%`);
  console.log(`    Compute Time: ${dtwAC.computeTimeMs.toFixed(2)}ms`);

  // LCS Demo
  console.log();
  console.log('='.repeat(70));
  console.log('  Longest Common Subsequence (LCS) Demo');
  console.log('='.repeat(70));
  console.log();

  const lcsResult = analyzer.findCommonPatterns(seqA, seqB);
  console.log('LCS between SeqA and SeqB:');
  console.log(`  Length: ${lcsResult.length}`);
  console.log(`  Similarity: ${(lcsResult.similarity * 100).toFixed(1)}%`);
  console.log(`  Common indices in A: [${lcsResult.indicesA.slice(0, 10).join(', ')}${lcsResult.indicesA.length > 10 ? '...' : ''}]`);
  console.log(`  Common indices in B: [${lcsResult.indicesB.slice(0, 10).join(', ')}${lcsResult.indicesB.length > 10 ? '...' : ''}]`);

  // Forecasting Demo
  console.log();
  console.log('='.repeat(70));
  console.log('  Time Series Forecasting Demo');
  console.log('='.repeat(70));
  console.log();

  console.log('Forecasting next 10 points:');
  const forecast = analyzer.forecast(10, 'ensemble');
  console.log(`  Method: ${forecast.method}`);
  console.log(`  Accuracy: ${(forecast.accuracy * 100).toFixed(1)}%`);
  console.log('  Predictions:');
  for (let i = 0; i < forecast.values.length; i++) {
    const value = forecast.values[i];
    const ci = forecast.confidenceIntervals[i];
    console.log(`    t+${i + 1}: ${value.toFixed(2)} [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}]`);
  }

  // Learned Patterns
  console.log();
  console.log('-'.repeat(70));
  console.log('Learned Patterns:');
  const patterns = analyzer.getStats().learnedPatterns;
  for (let i = 0; i < Math.min(5, patterns.length); i++) {
    const p = patterns[i];
    console.log(`  Pattern ${i + 1}:`);
    console.log(`    Category: ${p.category}`);
    console.log(`    Occurrences: ${p.occurrences}`);
    console.log(`    Avg Duration: ${p.avgDuration.toFixed(0)}`);
    console.log(`    Prediction Accuracy: ${(p.predictionAccuracy * 100).toFixed(1)}%`);
  }

  console.log();
  console.log('='.repeat(70));
  console.log('  Streaming Demo Complete!');
  console.log('='.repeat(70));
}

function generateSinusoidalPattern(length: number, amplitude: number, noiseLevel: number): number[] {
  const pattern: number[] = [];
  for (let i = 0; i < length; i++) {
    const value = Math.sin(i * 0.3) * amplitude + amplitude + (Math.random() - 0.5) * noiseLevel * amplitude;
    pattern.push(value);
  }
  return pattern;
}

function generateRandomPattern(length: number, min: number, max: number): number[] {
  const pattern: number[] = [];
  for (let i = 0; i < length; i++) {
    pattern.push(min + Math.random() * (max - min));
  }
  return pattern;
}

// Run demo
runStreamingDemo().catch(console.error);
