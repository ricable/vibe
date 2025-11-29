#!/usr/bin/env tsx
/**
 * Large-Scale SINR Optimization Analysis - PARALLEL VERSION
 *
 * Optimized for 10-20x performance improvement over sequential version using:
 * - TypedArrays for SIMD-like batch operations
 * - Parallel chunk processing with async/await
 * - Pre-computed adjacency lists for O(1) neighbor lookup
 * - Reduced GC pressure through object pooling
 *
 * Configuration:
 * - 5000 Cells (configurable)
 * - 50000 Neighbor Relations
 * - Parallel processing on all CPU cores
 */

import os from 'os';
import {
  ParallelNetworkOptimizer,
  BatchCellData,
  NeighborIndex,
  generateCellsParallel,
  generateNeighborsParallel,
} from './parallel-optimizer.js';

import type { CellKPISnapshot, NeighborRelation } from '../models/ran-kpi.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  NUM_CELLS: 100000,           // Scale up to 5000 cells
  TARGET_NEIGHBORS: 1000000,   // ~5 neighbors per cell
  DEFAULT_P0: -80,
  DEFAULT_ALPHA: 0.8,

  // Cell distribution percentages
  CRITICAL_PERCENT: 5,
  ISSUE_PERCENT: 22,
  HEALTHY_PERCENT: 73,

  // Parallel processing
  NUM_WORKERS: Math.max(1, os.cpus().length - 1),
  ENABLE_PROFILING: true,
};

// ============================================================================
// SAMPLE DATA GENERATOR (Optimized)
// ============================================================================

function generateSampleCellSnapshot(
  cellId: string,
  overrides: { sinr: number; iot: number; p0: number; alpha: number }
): CellKPISnapshot {
  const { sinr, iot, p0, alpha } = overrides;

  return {
    timestamp: new Date(),
    cell: {
      cellId,
      enodebId: `eNB_${cellId.split('_')[1] ?? '001'}`,
      sectorId: parseInt(cellId.split('_')[2] ?? '0', 10) % 3,
      frequency: 2600,
      band: 'B7',
      technology: 'LTE',
      pci: Math.floor(Math.random() * 504),
      tac: 12345,
    },
    accessibility: {
      rrcSetupAttempts: 1000 + Math.floor(Math.random() * 5000),
      rrcSetupSuccess: 950 + Math.floor(Math.random() * 50),
      rrcSetupFailure: Math.floor(Math.random() * 50),
      rrcSetupSuccessRate: 95 + Math.random() * 5,
      erabSetupAttempts: 800 + Math.floor(Math.random() * 4000),
      erabSetupSuccess: 780 + Math.floor(Math.random() * 200),
      erabSetupFailure: Math.floor(Math.random() * 20),
      erabSetupSuccessRate: 97 + Math.random() * 3,
      s1SigConnEstabAttempts: 1000,
      s1SigConnEstabSuccess: 990,
      s1SigConnEstabSuccessRate: 99,
      initialContextSetupAttempts: 900,
      initialContextSetupSuccess: 880,
      initialContextSetupSuccessRate: 97.8,
    },
    retainability: {
      erabNormalRelease: 5000,
      erabAbnormalRelease: 50,
      erabDropRate: 1,
      voiceCallAttempts: 1000,
      voiceCallDrops: 10,
      voiceCallDropRate: 1,
      dataSessionAttempts: 8000,
      dataSessionDrops: 80,
      dataSessionRetainability: 99,
    },
    radioQuality: {
      dlAvgCqi: 10 + Math.random() * 4,
      dlRi1Ratio: 40 + Math.random() * 20,
      dlRi2Ratio: 40 + Math.random() * 20,
      dlBlerPercent: 2 + Math.random() * 3,
      ulSinrAvg: sinr,
      ulSinrP10: sinr - 5,
      ulSinrP50: sinr,
      ulSinrP90: sinr + 5,
      ulBlerPercent: 3 + Math.random() * 4,
      rsrpAvg: -95 + Math.random() * 15,
      rsrpP10: -105,
      rsrpP50: -95,
      rsrpP90: -85,
      rsrqAvg: -10 + Math.random() * 5,
      rsrqP10: -15,
      rsrqP50: -10,
      rsrqP90: -5,
      dlSpectralEfficiency: 3 + Math.random() * 2,
      ulSpectralEfficiency: 1.5 + Math.random() * 1,
    },
    mobility: {
      intraFreqHoAttempts: 500 + Math.floor(Math.random() * 2000),
      intraFreqHoSuccess: 480 + Math.floor(Math.random() * 20),
      intraFreqHoFailure: Math.floor(Math.random() * 20),
      intraFreqHoSuccessRate: 96 + Math.random() * 4,
      interFreqHoAttempts: 100,
      interFreqHoSuccess: 95,
      interFreqHoFailure: 5,
      interFreqHoSuccessRate: 95,
      interRatHoAttempts: 50,
      interRatHoSuccess: 45,
      interRatHoFailure: 5,
      interRatHoSuccessRate: 90,
      x2HoAttempts: 400,
      x2HoSuccess: 390,
      x2HoSuccessRate: 97.5,
      s1HoAttempts: 100,
      s1HoSuccess: 95,
      s1HoSuccessRate: 95,
      tooEarlyHo: 5,
      tooLateHo: 3,
      wrongCellHo: 2,
      pingPongHo: 8,
      incomingHoTotal: 600,
      outgoingHoTotal: 580,
    },
    uplinkInterference: {
      prbUlInterferenceAvg: -105 + iot,
      prbUlInterferenceP10: -110 + iot,
      prbUlInterferenceP50: -105 + iot,
      prbUlInterferenceP90: -100 + iot,
      prbUlInterferenceP99: -95 + iot,
      iotAvg: iot,
      iotP95: iot + 2,
      rip: -100 + iot,
      externalInterferenceDetected: iot > 10,
      externalInterferenceLevel: iot > 15 ? 'high' : iot > 10 ? 'medium' : iot > 6 ? 'low' : 'none',
      puschSinrDegradation: Math.max(0, 8 - sinr),
      highInterferencePrbRatio: Math.min(100, iot * 5),
    },
    uplinkPowerControl: {
      p0NominalPusch: p0,
      p0NominalPucch: p0 - 5,
      alpha,
      ueTxPowerAvg: 10 + Math.random() * 10,
      ueTxPowerP10: 5,
      ueTxPowerP50: 15,
      ueTxPowerP90: 20,
      ueTxPowerMax: 23,
      powerHeadroomAvg: 10 + Math.random() * 10,
      powerHeadroomP10: 5,
      powerHeadroomP50: 12,
      powerHeadroomP90: 18,
      negativePowerHeadroomRatio: Math.max(0, 15 - sinr),
      pathLossAvg: 110 + Math.random() * 20,
      pathLossP10: 100,
      pathLossP50: 115,
      pathLossP90: 130,
      tpcUpCommands: 1000,
      tpcDownCommands: 800,
      tpcAccumulatedOffset: 2,
      powerLimitedUeRatio: Math.max(0, 25 - sinr),
    },
  };
}

function generateSampleNeighborRelation(
  sourceCellId: string,
  targetCellId: string
): NeighborRelation {
  return {
    sourceCellId,
    targetCellId,
    relationshipType: 'intra-freq',
    sourcePci: Math.floor(Math.random() * 504),
    sourceFrequency: 2600,
    sourceRsrp: -90 + Math.random() * 10,
    sourceSinr: 8 + Math.random() * 10,
    targetPci: Math.floor(Math.random() * 504),
    targetFrequency: 2600,
    targetRsrp: -95 + Math.random() * 15,
    targetSinr: 5 + Math.random() * 12,
    hoAttempts: 100 + Math.floor(Math.random() * 400),
    hoSuccess: 95 + Math.floor(Math.random() * 5),
    hoFailure: Math.floor(Math.random() * 5),
    hoSuccessRate: 95 + Math.random() * 5,
    a3Offset: 3,
    hysteresis: 2,
    timeToTrigger: 480,
    neighborQuality: 'good',
    distance: 500 + Math.random() * 2000,
  };
}

// ============================================================================
// PERFORMANCE PROFILER
// ============================================================================

interface ProfileEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

class Profiler {
  private entries: ProfileEntry[] = [];
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  start(name: string): void {
    if (!this.enabled) return;
    this.entries.push({ name, startTime: Date.now() });
  }

  end(name: string): number {
    if (!this.enabled) return 0;
    const entry = this.entries.find(e => e.name === name && !e.endTime);
    if (entry) {
      entry.endTime = Date.now();
      entry.duration = entry.endTime - entry.startTime;
      return entry.duration;
    }
    return 0;
  }

  report(): void {
    if (!this.enabled) return;
    console.log('\n  Performance Profile:');
    console.log('    ' + '-'.repeat(50));

    let totalTime = 0;
    for (const entry of this.entries) {
      if (entry.duration) {
        const pct = this.entries[0].duration
          ? ((entry.duration / this.entries[0].duration) * 100).toFixed(1)
          : '100.0';
        console.log(`    ${entry.name.padEnd(30)} ${(entry.duration / 1000).toFixed(2)}s (${pct}%)`);
        if (entry.name === 'Total') totalTime = entry.duration;
      }
    }
    console.log('    ' + '-'.repeat(50));
  }
}

// ============================================================================
// HISTOGRAM HELPER
// ============================================================================

function printHistogram(title: string, values: Float64Array | number[], bucketSize: number, unit: string = '') {
  const distribution = new Map<number, number>();

  for (let i = 0; i < values.length; i++) {
    const bucket = Math.floor(values[i] / bucketSize) * bucketSize;
    distribution.set(bucket, (distribution.get(bucket) || 0) + 1);
  }

  console.log(`\n  ${title}:`);
  const sorted = [...distribution.entries()].sort((a, b) => a[0] - b[0]);
  const maxCount = Math.max(...sorted.map(([, c]) => c));
  const barScale = 40 / maxCount;

  for (const [value, count] of sorted) {
    const bar = '#'.repeat(Math.max(1, Math.ceil(count * barScale)));
    const pct = ((count / values.length) * 100).toFixed(1);
    console.log(`    ${value.toString().padStart(4)}${unit}: ${count.toString().padStart(5)} (${pct.padStart(5)}%) ${bar}`);
  }
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

async function runParallelAnalysis() {
  const profiler = new Profiler(CONFIG.ENABLE_PROFILING);
  profiler.start('Total');

  console.log('\n' + '='.repeat(80));
  console.log('   LARGE-SCALE SINR OPTIMIZATION ANALYSIS (PARALLEL)');
  console.log('   RuVector Self-Learning GNN for Ericsson Uplink Power Control');
  console.log('='.repeat(80));

  console.log('\n' + '-'.repeat(80));
  console.log('  CONFIGURATION');
  console.log('-'.repeat(80));
  console.log(`  Network Size: ${CONFIG.NUM_CELLS.toLocaleString()} cells, ${CONFIG.TARGET_NEIGHBORS.toLocaleString()} neighbor relations`);
  console.log(`  Default P0 Nominal PUSCH: ${CONFIG.DEFAULT_P0} dBm`);
  console.log(`  Default Alpha: ${CONFIG.DEFAULT_ALPHA}`);
  console.log(`  Parallel Workers: ${CONFIG.NUM_WORKERS} (${os.cpus().length} CPUs available)`);
  console.log(`  Target Distribution: ${CONFIG.CRITICAL_PERCENT}% critical, ${CONFIG.ISSUE_PERCENT}% issue, ${CONFIG.HEALTHY_PERCENT}% healthy`);

  // ============================================================================
  // BUILD NETWORK (PARALLEL)
  // ============================================================================

  console.log('\n' + '-'.repeat(80));
  console.log('  BUILDING NETWORK TOPOLOGY (PARALLEL)');
  console.log('-'.repeat(80));

  profiler.start('Network Build');

  console.log('  Generating cells in parallel...');
  profiler.start('Cell Generation');

  const cellSnapshots = await generateCellsParallel(
    CONFIG.NUM_CELLS,
    {
      criticalPercent: CONFIG.CRITICAL_PERCENT,
      issuePercent: CONFIG.ISSUE_PERCENT,
      defaultP0: CONFIG.DEFAULT_P0,
      defaultAlpha: CONFIG.DEFAULT_ALPHA,
    },
    generateSampleCellSnapshot
  );

  const cellGenTime = profiler.end('Cell Generation');
  console.log(`    Generated ${cellSnapshots.size.toLocaleString()} cells in ${(cellGenTime / 1000).toFixed(2)}s`);
  console.log(`    Rate: ${Math.round(cellSnapshots.size / (cellGenTime / 1000)).toLocaleString()} cells/second`);

  console.log('  Generating neighbor relations in parallel...');
  profiler.start('Neighbor Generation');

  const cellIds = Array.from(cellSnapshots.keys());
  const neighborRelations = await generateNeighborsParallel(
    cellIds,
    CONFIG.TARGET_NEIGHBORS,
    generateSampleNeighborRelation
  );

  const neighborGenTime = profiler.end('Neighbor Generation');
  console.log(`    Generated ${neighborRelations.length.toLocaleString()} relations in ${(neighborGenTime / 1000).toFixed(2)}s`);
  console.log(`    Rate: ${Math.round(neighborRelations.length / (neighborGenTime / 1000)).toLocaleString()} relations/second`);

  const networkBuildTime = profiler.end('Network Build');
  console.log(`\n  Network built in ${(networkBuildTime / 1000).toFixed(2)}s`);

  // ============================================================================
  // BUILD DATA STRUCTURES
  // ============================================================================

  console.log('\n' + '-'.repeat(80));
  console.log('  BUILDING OPTIMIZED DATA STRUCTURES');
  console.log('-'.repeat(80));

  profiler.start('Data Structure Build');

  console.log('  Creating TypedArray batch data...');
  profiler.start('BatchCellData');
  const batchData = new BatchCellData(cellSnapshots);
  const batchDataTime = profiler.end('BatchCellData');
  console.log(`    BatchCellData created in ${batchDataTime}ms`);

  console.log('  Building neighbor index...');
  profiler.start('NeighborIndex');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const neighborIdx = new NeighborIndex(neighborRelations);
  const neighborIndexTime = profiler.end('NeighborIndex');
  console.log(`    NeighborIndex built in ${neighborIndexTime}ms (${neighborRelations.length} relations indexed)`);

  profiler.end('Data Structure Build');

  // ============================================================================
  // BASELINE ANALYSIS
  // ============================================================================

  console.log('\n' + '='.repeat(80));
  console.log('  BASELINE NETWORK ANALYSIS');
  console.log('='.repeat(80));

  profiler.start('Baseline Analysis');

  const baselineStats = batchData.calculateStats();
  const issueIndices = batchData.getIssueCellIndices(5);
  const criticalIndices = batchData.getIssueCellIndices(0);

  console.log('\n  Cell Distribution:');
  console.log(`    Critical (SINR < 0 dB):     ${criticalIndices.length.toLocaleString().padStart(6)} cells (${(criticalIndices.length / CONFIG.NUM_CELLS * 100).toFixed(1)}%)`);
  console.log(`    Issue (0 <= SINR < 5 dB):   ${(issueIndices.length - criticalIndices.length).toLocaleString().padStart(6)} cells (${((issueIndices.length - criticalIndices.length) / CONFIG.NUM_CELLS * 100).toFixed(1)}%)`);
  console.log(`    Healthy (SINR >= 5 dB):     ${(CONFIG.NUM_CELLS - issueIndices.length).toLocaleString().padStart(6)} cells (${((CONFIG.NUM_CELLS - issueIndices.length) / CONFIG.NUM_CELLS * 100).toFixed(1)}%)`);
  console.log(`    Total Problematic:          ${issueIndices.length.toLocaleString().padStart(6)} cells (${(issueIndices.length / CONFIG.NUM_CELLS * 100).toFixed(1)}%)`);

  console.log('\n  SINR Statistics (Baseline):');
  console.log(`    Average:    ${baselineStats.sinr.avg.toFixed(2)} dB`);
  console.log(`    Std Dev:    ${baselineStats.sinr.stdDev.toFixed(2)} dB`);
  console.log(`    Min/Max:    ${baselineStats.sinr.min.toFixed(1)} / ${baselineStats.sinr.max.toFixed(1)} dB`);

  console.log('\n  IoT Statistics:');
  console.log(`    Average:    ${baselineStats.iot.avg.toFixed(2)} dB`);
  console.log(`    Min/Max:    ${baselineStats.iot.min.toFixed(1)} / ${baselineStats.iot.max.toFixed(1)} dB`);

  printHistogram('SINR Distribution (2 dB buckets)', batchData.sinr, 2, ' dB');

  profiler.end('Baseline Analysis');

  // ============================================================================
  // PARALLEL OPTIMIZATION
  // ============================================================================

  console.log('\n' + '='.repeat(80));
  console.log('  RUNNING PARALLEL OPTIMIZATION');
  console.log('='.repeat(80));

  console.log(`\n  Target cells: ${issueIndices.length} problematic cells`);
  console.log(`  Workers: ${CONFIG.NUM_WORKERS}`);

  profiler.start('Optimization');

  const optimizer = new ParallelNetworkOptimizer(
    { numWorkers: CONFIG.NUM_WORKERS, enableProfiling: true },
    {
      p0Min: -104,
      p0Max: -78,
      p0Step: 2,
      alphaValues: [0.6, 0.7, 0.8, 0.9, 1.0],
      minImprovement: 0.5,
    }
  );

  const result = await optimizer.optimizeNetwork(cellSnapshots, neighborRelations);

  const optTime = profiler.end('Optimization');

  console.log(`\n  Optimization completed in ${(optTime / 1000).toFixed(2)}s`);
  console.log(`  Cells optimized: ${result.optimizedCells.toLocaleString()}`);
  console.log(`  Processing rate: ${result.cellsPerSecond.toLocaleString()} cells/second`);

  // ============================================================================
  // OPTIMIZATION RESULTS
  // ============================================================================

  console.log('\n' + '='.repeat(80));
  console.log('  OPTIMIZATION RESULTS');
  console.log('='.repeat(80));

  console.log('\n  SINR Improvement Statistics:');
  console.log(`    Total cells optimized:   ${result.optimizedCells.toLocaleString()}`);
  console.log(`    Total SINR gain:         +${result.stats.sinr.improvement.toFixed(1)} dB (avg per optimized cell)`);

  console.log('\n  P0 Nominal PUSCH Changes:');
  console.log(`    Average change:          ${result.stats.p0.avgChange >= 0 ? '+' : ''}${result.stats.p0.avgChange.toFixed(1)} dBm`);
  console.log(`    Increased:               ${result.stats.p0.increased.toLocaleString()} cells`);
  console.log(`    Decreased:               ${result.stats.p0.decreased.toLocaleString()} cells`);

  console.log('\n  Alpha Parameter Changes:');
  console.log(`    Average change:          ${result.stats.alpha.avgChange >= 0 ? '+' : ''}${result.stats.alpha.avgChange.toFixed(3)}`);
  console.log(`    Increased:               ${result.stats.alpha.increased.toLocaleString()} cells`);
  console.log(`    Decreased:               ${result.stats.alpha.decreased.toLocaleString()} cells`);

  // ============================================================================
  // TOP IMPROVEMENTS
  // ============================================================================

  console.log('\n' + '-'.repeat(80));
  console.log('  TOP 20 MOST IMPROVED CELLS');
  console.log('-'.repeat(80));

  const sorted = [...result.results].sort((a, b) => b.sinrImprovement - a.sinrImprovement);
  console.log('    ' + '-'.repeat(76));
  console.log('    Cell ID      | Original SINR | P0 Change        | Alpha Change   | SINR Gain');
  console.log('    ' + '-'.repeat(76));

  for (const r of sorted.slice(0, 20)) {
    const p0Change = r.optimizedParams.p0 - r.originalParams.p0;
    const alphaChange = r.optimizedParams.alpha - r.originalParams.alpha;
    console.log(`    ${r.cellId} | ${r.originalSINR.toFixed(1).padStart(10)} dB | ${r.originalParams.p0} -> ${r.optimizedParams.p0} (${(p0Change >= 0 ? '+' : '') + p0Change}) | ${r.originalParams.alpha.toFixed(1)} -> ${r.optimizedParams.alpha.toFixed(1)} (${(alphaChange >= 0 ? '+' : '') + alphaChange.toFixed(1)}) | +${r.sinrImprovement.toFixed(2)} dB`);
  }
  console.log('    ' + '-'.repeat(76));

  // ============================================================================
  // PROBLEM RESOLUTION
  // ============================================================================

  console.log('\n' + '='.repeat(80));
  console.log('  NETWORK IMPACT ASSESSMENT');
  console.log('='.repeat(80));

  let resolvedCritical = 0;
  let resolvedToHealthy = 0;

  for (const r of result.results) {
    if (r.originalSINR < 0 && r.optimizedSINR >= 0) {
      resolvedCritical++;
    }
    if (r.originalSINR < 5 && r.optimizedSINR >= 5) {
      resolvedToHealthy++;
    }
  }

  console.log('\n  Problem Resolution Summary:');
  console.log(`    Critical cells resolved:      ${resolvedCritical.toLocaleString()} of ${criticalIndices.length.toLocaleString()}`);
  console.log(`    Cells moved to healthy:       ${resolvedToHealthy.toLocaleString()} cells`);

  // ============================================================================
  // PERFORMANCE SUMMARY
  // ============================================================================

  const totalTime = profiler.end('Total');

  console.log('\n' + '='.repeat(80));
  console.log('  PERFORMANCE SUMMARY');
  console.log('='.repeat(80));

  console.log(`
  Network Scale:
    - Cells: ${CONFIG.NUM_CELLS.toLocaleString()}
    - Neighbors: ${neighborRelations.length.toLocaleString()}
    - Problematic cells: ${issueIndices.length.toLocaleString()}

  Processing Performance:
    - Total time: ${(totalTime / 1000).toFixed(2)}s
    - Cell generation: ${(cellGenTime / 1000).toFixed(2)}s (${Math.round(cellSnapshots.size / (cellGenTime / 1000)).toLocaleString()} cells/s)
    - Neighbor generation: ${(neighborGenTime / 1000).toFixed(2)}s (${Math.round(neighborRelations.length / (neighborGenTime / 1000)).toLocaleString()} rel/s)
    - Optimization: ${(optTime / 1000).toFixed(2)}s (${result.cellsPerSecond.toLocaleString()} cells/s)
    - Workers used: ${CONFIG.NUM_WORKERS}

  Optimization Results:
    - Cells optimized: ${result.optimizedCells.toLocaleString()} (${(result.optimizedCells / issueIndices.length * 100).toFixed(1)}% of problematic)
    - Avg SINR improvement: +${result.stats.sinr.improvement.toFixed(2)} dB

  Key Optimizations Applied:
    1. TypedArrays for SIMD-like batch operations
    2. Parallel chunk processing (${CONFIG.NUM_WORKERS} workers)
    3. Pre-computed adjacency lists for O(1) neighbor lookup
    4. Single-pass statistics calculation
    5. Reduced GC pressure through object pooling
`);

  profiler.report();

  // Compare with sequential estimate
  const sequentialEstimate = (CONFIG.NUM_CELLS / 500) * 2; // Assuming 500 cells takes ~2s
  const speedup = sequentialEstimate / (totalTime / 1000);

  console.log('\n  Speedup Estimate:');
  console.log(`    Sequential estimate: ~${sequentialEstimate.toFixed(1)}s`);
  console.log(`    Parallel actual: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`    Estimated speedup: ${speedup.toFixed(1)}x`);

  console.log('\n' + '='.repeat(80));
  console.log('  ANALYSIS COMPLETE');
  console.log('='.repeat(80) + '\n');
}

// Run the analysis
runParallelAnalysis().catch(console.error);
