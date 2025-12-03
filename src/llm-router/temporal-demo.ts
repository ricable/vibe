/**
 * Temporal Analysis Demo with SONA Integration
 *
 * Demonstrates the complete temporal analysis pipeline:
 * - SONA adaptive learning integration
 * - Time series decomposition
 * - Seasonal pattern detection
 * - Trend analysis
 * - Anomaly detection with feedback
 */

import SONAAdapter from './sona-adapter.js';
import { TemporalAnalyzer, DTWAnalyzer, LCSAnalyzer, TemporalForecaster } from './temporal-analyzer.js';

async function runTemporalDemo(): Promise<void> {
  console.log('='.repeat(70));
  console.log('  Temporal Analysis with SONA Integration Demo');
  console.log('  Self-Optimizing Neural Architecture + Time Series Analysis');
  console.log('='.repeat(70));
  console.log();

  // Initialize SONA
  const sona = new SONAAdapter(512);
  await sona.initialize();

  // Initialize analyzers
  const dtwAnalyzer = new DTWAnalyzer(50);
  const lcsAnalyzer = new LCSAnalyzer(0.15);
  const forecaster = new TemporalForecaster(500);

  // Generate sample time series data
  console.log('Generating sample time series data...');
  const hourlyData = generateHourlyTimeSeries(168); // 1 week of hourly data
  const dailyData = generateDailyTimeSeries(90); // 3 months of daily data

  console.log(`  Hourly data: ${hourlyData.length} points (1 week)`);
  console.log(`  Daily data: ${dailyData.length} points (3 months)`);
  console.log();

  // Time Series Analysis
  console.log('='.repeat(70));
  console.log('  Time Series Analysis');
  console.log('='.repeat(70));
  console.log();

  // Add data to forecaster
  for (const value of hourlyData) {
    forecaster.addDataPoint(value);
  }

  // Multiple forecasting methods
  console.log('Forecasting Comparison (next 24 hours):');
  console.log('-'.repeat(70));

  const methods = ['exponential', 'holt_winters', 'ar', 'ensemble'] as const;
  for (const method of methods) {
    const forecast = method === 'exponential'
      ? forecaster.forecastExponentialSmoothing(24)
      : method === 'holt_winters'
        ? forecaster.forecastHoltWinters(24)
        : method === 'ar'
          ? forecaster.forecastAutoRegressive(24)
          : forecaster.forecastEnsemble(24);

    console.log(`\n${method.toUpperCase()}:`);
    console.log(`  Accuracy: ${(forecast.accuracy * 100).toFixed(1)}%`);
    console.log(`  First 6 predictions: ${forecast.values.slice(0, 6).map(v => v.toFixed(1)).join(', ')}`);

    // Learn from forecast
    sona.learnBackground(
      `forecast:${method}`,
      JSON.stringify(forecast.values.slice(0, 6)),
      forecast.accuracy,
      { method, horizon: 24 }
    );
  }

  // Pattern Matching with DTW
  console.log('\n' + '='.repeat(70));
  console.log('  Pattern Matching with Dynamic Time Warping');
  console.log('='.repeat(70));
  console.log();

  // Extract weekly patterns
  const week1 = hourlyData.slice(0, 24);
  const week2 = hourlyData.slice(24, 48);
  const week3 = hourlyData.slice(48, 72);
  const week4 = hourlyData.slice(96, 120);

  console.log('Comparing daily patterns:');
  console.log('-'.repeat(70));

  const patterns = [
    { name: 'Day 1 vs Day 2', a: week1, b: week2 },
    { name: 'Day 1 vs Day 3', a: week1, b: week3 },
    { name: 'Day 1 vs Day 5', a: week1, b: week4 },
  ];

  for (const { name, a, b } of patterns) {
    const result = dtwAnalyzer.compute(a, b);
    const similarity = Math.exp(-result.normalizedDistance) * 100;

    console.log(`${name}:`);
    console.log(`  DTW Distance: ${result.distance.toFixed(2)}`);
    console.log(`  Similarity: ${similarity.toFixed(1)}%`);
    console.log(`  Compute Time: ${result.computeTimeMs.toFixed(2)}ms`);

    // Learn from pattern comparison
    sona.adaptInstant(name, similarity > 70 ? 'similar' : 'different', similarity / 100);
  }

  // LCS for Common Pattern Detection
  console.log('\n' + '='.repeat(70));
  console.log('  Common Pattern Detection with LCS');
  console.log('='.repeat(70));
  console.log();

  const lcsResult = lcsAnalyzer.compute(week1, week2);
  console.log('Longest Common Subsequence between Day 1 and Day 2:');
  console.log(`  Length: ${lcsResult.length} / ${week1.length}`);
  console.log(`  Similarity: ${(lcsResult.similarity * 100).toFixed(1)}%`);
  console.log(`  Common pattern values: ${lcsResult.sequence.slice(0, 8).map(v => v.toFixed(1)).join(', ')}...`);

  // Find all common patterns
  const allCommon = lcsAnalyzer.findAllCommon(hourlyData.slice(0, 100), hourlyData.slice(50, 150), 5);
  console.log(`\nFound ${allCommon.length} common subsequences (min length 5)`);

  // Anomaly Detection with Learning
  console.log('\n' + '='.repeat(70));
  console.log('  Anomaly Detection with Adaptive Learning');
  console.log('='.repeat(70));
  console.log();

  const temporalAnalyzer = new TemporalAnalyzer({
    windowSize: 24,
    slideSize: 6,
  });

  // Set reference pattern
  temporalAnalyzer.setReferenceSequence(week1);

  // Inject anomalies into test data
  const testData = [...hourlyData];
  testData[50] = testData[50] * 3; // Point anomaly
  testData[100] = testData[100] * 0.3; // Another point anomaly
  // Add trend change
  for (let i = 120; i < 144; i++) {
    testData[i] = testData[i] + (i - 120) * 2;
  }

  console.log('Processing data with injected anomalies:');
  console.log('-'.repeat(70));

  let anomalyCount = 0;
  for (let i = 0; i < testData.length; i++) {
    const result = temporalAnalyzer.processStreamPoint(testData[i]);

    if (result.anomaly) {
      anomalyCount++;
      console.log(
        `[t=${i.toString().padStart(3)}] ${result.anomaly.type.toUpperCase()} anomaly ` +
        `(score: ${result.anomaly.score.toFixed(2)})`
      );

      // Learn from anomaly detection
      sona.learnBackground(
        `anomaly:${result.anomaly.type}`,
        `Value ${result.anomaly.value.toFixed(2)} detected as ${result.anomaly.type}`,
        result.anomaly.score,
        { index: i, type: result.anomaly.type }
      );
    }
  }

  console.log(`\nTotal anomalies detected: ${anomalyCount}`);

  // SONA Learning Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SONA Learning Summary');
  console.log('='.repeat(70));
  console.log();

  const sonaMetrics = sona.getMetrics();
  console.log('SONA Metrics:');
  console.log(`  Instant Latency: ${sonaMetrics.instantLatency.toFixed(2)}ms`);
  console.log(`  Background Latency: ${sonaMetrics.backgroundLatency.toFixed(2)}ms`);
  console.log(`  Adaptation Rate: ${sonaMetrics.adaptationRate.toFixed(4)}/s`);
  console.log(`  Pattern Matches: ${sonaMetrics.patternMatches}`);
  console.log(`  Forgetting Prevention: ${sonaMetrics.forgettingPrevention}`);
  console.log(`  Total Adaptations: ${sonaMetrics.totalAdaptations}`);

  // Query learned patterns
  console.log('\nLearned Patterns (from ReasoningBank):');
  console.log('-'.repeat(70));

  const learnedPatterns = sona.queryPatterns('temporal analysis anomaly', 5);
  for (let i = 0; i < learnedPatterns.length; i++) {
    const p = learnedPatterns[i];
    console.log(`  ${i + 1}. ${p.pattern.slice(0, 50)}...`);
    console.log(`     Category: ${p.category}, Confidence: ${(p.confidence * 100).toFixed(0)}%`);
  }

  // Temporal Stats Summary
  console.log('\n' + '-'.repeat(70));
  console.log('Temporal Analysis Stats:');
  const tempStats = temporalAnalyzer.getStats();
  console.log(`  Windows Processed: ${tempStats.streaming.windowsProcessed}`);
  console.log(`  Learned Patterns: ${tempStats.streaming.learnedPatterns}`);
  console.log(`  Total Anomalies: ${tempStats.streaming.totalAnomalies}`);
  console.log(`  History Length: ${tempStats.historyLength}`);

  // Export state
  const exportedState = sona.exportState();
  console.log('\nExported State:');
  console.log(`  Patterns: ${exportedState.patterns.length}`);
  console.log(`  Uptime: ${(exportedState.uptime / 1000).toFixed(1)}s`);

  console.log('\n' + '='.repeat(70));
  console.log('  Temporal Analysis Demo Complete!');
  console.log('='.repeat(70));

  // Cleanup
  sona.shutdown();
}

function generateHourlyTimeSeries(hours: number): number[] {
  const data: number[] = [];
  const baseLoad = 50;
  const dailyAmplitude = 30;
  const weeklyAmplitude = 10;
  const noise = 5;

  for (let h = 0; h < hours; h++) {
    const hourOfDay = h % 24;
    const dayOfWeek = Math.floor(h / 24) % 7;

    // Daily pattern (peak at noon, low at night)
    const dailyPattern = Math.sin((hourOfDay - 6) * Math.PI / 12) * dailyAmplitude;

    // Weekly pattern (lower on weekends)
    const isWeekend = dayOfWeek >= 5;
    const weeklyPattern = isWeekend ? -weeklyAmplitude : weeklyAmplitude * 0.3;

    // Trend
    const trend = h * 0.01;

    // Random noise
    const randomNoise = (Math.random() - 0.5) * noise;

    data.push(baseLoad + dailyPattern + weeklyPattern + trend + randomNoise);
  }

  return data;
}

function generateDailyTimeSeries(days: number): number[] {
  const data: number[] = [];
  const baseValue = 100;
  const seasonalAmplitude = 30;
  const trendSlope = 0.2;
  const noise = 10;

  for (let d = 0; d < days; d++) {
    // Seasonal pattern (quarterly)
    const seasonalPhase = (d / 90) * 2 * Math.PI;
    const seasonalPattern = Math.sin(seasonalPhase) * seasonalAmplitude;

    // Linear trend
    const trend = d * trendSlope;

    // Weekly pattern (lower on weekends)
    const dayOfWeek = d % 7;
    const weeklyEffect = dayOfWeek >= 5 ? -10 : 5;

    // Random noise
    const randomNoise = (Math.random() - 0.5) * noise;

    data.push(baseValue + seasonalPattern + trend + weeklyEffect + randomNoise);
  }

  return data;
}

// Run demo
runTemporalDemo().catch(console.error);
