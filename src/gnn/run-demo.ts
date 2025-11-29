#!/usr/bin/env tsx
/**
 * RuVector GNN Demo Runner
 *
 * Unified demo for the Self-Learning GNN (RuVector) for Ericsson Uplink Optimization.
 * Combines surrogate model and self-learning demonstrations.
 */

import {
  SelfLearningUplinkGNN,
  EricssonUplinkOptimizer,
  RuVectorGNNLayer,
  ExperienceReplayBuffer,
  DifferentiableParameterSearch,
  SurrogateGraphBuilder,
  IssueCellDetector,
  runRuVectorGNNLayer,
  compressEmbeddings,
  differentiableSearch,
} from './index.js';

import type { CellKPISnapshot, NeighborRelation } from '../models/ran-kpi.js';

// ============================================================================
// SAMPLE DATA GENERATOR
// ============================================================================

function generateSampleCellSnapshot(
  cellId: string,
  overrides: Partial<{ sinr: number; iot: number; p0: number; alpha: number }> = {}
): CellKPISnapshot {
  const sinr = overrides.sinr ?? 5 + Math.random() * 15;
  const iot = overrides.iot ?? 3 + Math.random() * 8;
  const p0 = overrides.p0 ?? -100 + Math.floor(Math.random() * 15);
  const alpha = overrides.alpha ?? [0.6, 0.7, 0.8, 0.9, 1.0][Math.floor(Math.random() * 5)];

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
// DEMO FUNCTIONS
// ============================================================================

async function demoRuVectorGNNLayer() {
  console.log('\n' + '='.repeat(70));
  console.log('Demo 1: RuVector GNN Layer');
  console.log('='.repeat(70));

  const layer = await runRuVectorGNNLayer(24, 64, 4, 0.1);
  console.log('  Created GNN layer with multi-head attention');

  // Create sample node features (5 nodes, 24 features each)
  const nodeFeatures = Array(5).fill(null).map(() =>
    Array(24).fill(0).map(() => Math.random())
  );

  // Create sample adjacency matrix
  const adjacencyMatrix = [
    [1, 0.8, 0.3, 0, 0],
    [0.8, 1, 0.5, 0.2, 0],
    [0.3, 0.5, 1, 0.7, 0.4],
    [0, 0.2, 0.7, 1, 0.6],
    [0, 0, 0.4, 0.6, 1],
  ];

  console.log('  Generated sample node features (5 nodes x 24 features)');

  // Forward pass
  const output = layer.forward(nodeFeatures, adjacencyMatrix);
  console.log(`  Forward pass completed: output shape [${output.length}][${output[0].length}]`);

  // Check config
  const config = layer.getConfig();
  console.log(`  Layer config: inputDim=${config.inputDim}, hiddenDim=${config.hiddenDim}, heads=${config.numHeads}`);
}

function demoExperienceReplay() {
  console.log('\n' + '='.repeat(70));
  console.log('Demo 2: Experience Replay Buffer');
  console.log('='.repeat(70));

  const buffer = new ExperienceReplayBuffer(1000, 0.6, 0.4, 0.001);

  // Add 100 experience samples
  for (let i = 0; i < 100; i++) {
    buffer.add({
      timestamp: new Date(),
      graph: {
        nodeIds: ['CELL_001'],
        nodeFeatures: [[...Array(24).fill(0).map(() => Math.random())]],
        adjacencyMatrix: [[1]],
        edgeFeatures: [[[]]],
        powerParams: new Map([['CELL_001', { p0: -100, alpha: 0.8 }]]),
      },
      cellId: 'CELL_001',
      params: { p0: -100 + Math.floor(Math.random() * 15), alpha: 0.8 },
      predictedSINR: 5 + Math.random() * 10,
      actualSINR: 5 + Math.random() * 10,
      reward: Math.random() > 0.5 ? 1 : 0.5,
    });
  }

  console.log(`  Added 100 experience samples to buffer`);

  const stats = buffer.getStats();
  console.log(`  Buffer stats: size=${stats.size}, avgPriority=${stats.avgPriority.toFixed(3)}, avgReward=${stats.avgReward.toFixed(3)}`);

  // Sample a batch
  const { samples, weights } = buffer.sample(16);
  console.log(`  Sampled batch of ${samples.length} with importance weights`);
}

function demoDifferentiableSearch() {
  console.log('\n' + '='.repeat(70));
  console.log('Demo 3: Differentiable Parameter Search');
  console.log('='.repeat(70));

  const search = new DifferentiableParameterSearch(1.0);

  // Generate candidates
  const currentParams = { p0: -100, alpha: 0.8 };
  const candidates = search.generateCandidates(currentParams, {
    inputDim: 24,
    hiddenDim: 64,
    numHeads: 4,
    p0Range: { min: -110, max: -85, step: 1 },
    alphaValues: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    thresholds: { sinrLow: 5, sinrCritical: 0, iotHigh: 10, powerLimitedHigh: 20 },
    optimization: { maxIterations: 100, convergenceThreshold: 0.01, neighborImpactWeight: 0.3, minImprovement: 0.5 },
    training: { learningRate: 0.001, batchSize: 32, epochs: 100 },
  });

  console.log(`  Generated ${candidates.length} candidate parameter combinations`);

  // Embed candidates with a simple predictor
  search.embedCandidates(candidates, (params) => {
    // Simple predictor: lower P0 = higher SINR (simplified model)
    return 10 + (params.p0 + 110) * 0.5 + (1 - params.alpha) * 3;
  });

  console.log('  Embedded candidates with SINR predictions');

  // Soft search
  const queryEmbedding = [0.4, 0.8, 0.5]; // [normalized P0, alpha, target SINR]
  const softResult = search.softSearch(queryEmbedding);
  console.log(`  Soft search result: P0=${softResult.params.p0}, Alpha=${softResult.params.alpha}, confidence=${softResult.confidence.toFixed(3)}`);

  // Hard search
  const hardResult = search.hardSearch(queryEmbedding);
  console.log(`  Hard search result: P0=${hardResult.params.p0}, Alpha=${hardResult.params.alpha}, score=${hardResult.score.toFixed(3)}`);
}

async function demoSelfLearningGNN() {
  console.log('\n' + '='.repeat(70));
  console.log('Demo 4: Self-Learning Uplink GNN');
  console.log('='.repeat(70));

  const gnn = new SelfLearningUplinkGNN();

  // Create sample network with issue cells
  const cellSnapshots = new Map<string, CellKPISnapshot>();
  const neighborRelations: NeighborRelation[] = [];

  // Add cells - some with issues
  cellSnapshots.set('CELL_001', generateSampleCellSnapshot('CELL_001', { sinr: 2, iot: 12, p0: -98, alpha: 0.7 }));
  cellSnapshots.set('CELL_002', generateSampleCellSnapshot('CELL_002', { sinr: 15, iot: 5, p0: -100, alpha: 0.8 }));
  cellSnapshots.set('CELL_003', generateSampleCellSnapshot('CELL_003', { sinr: 3, iot: 14, p0: -95, alpha: 0.6 }));
  cellSnapshots.set('CELL_004', generateSampleCellSnapshot('CELL_004', { sinr: 12, iot: 6, p0: -102, alpha: 0.9 }));
  cellSnapshots.set('CELL_005', generateSampleCellSnapshot('CELL_005', { sinr: -1, iot: 16, p0: -90, alpha: 0.5 }));

  // Add neighbor relations
  neighborRelations.push(generateSampleNeighborRelation('CELL_001', 'CELL_002'));
  neighborRelations.push(generateSampleNeighborRelation('CELL_001', 'CELL_003'));
  neighborRelations.push(generateSampleNeighborRelation('CELL_002', 'CELL_003'));
  neighborRelations.push(generateSampleNeighborRelation('CELL_002', 'CELL_004'));
  neighborRelations.push(generateSampleNeighborRelation('CELL_003', 'CELL_004'));
  neighborRelations.push(generateSampleNeighborRelation('CELL_003', 'CELL_005'));
  neighborRelations.push(generateSampleNeighborRelation('CELL_004', 'CELL_005'));

  console.log(`  Created network with ${cellSnapshots.size} cells and ${neighborRelations.length} neighbor relations`);

  // Build graph
  const graphBuilder = new SurrogateGraphBuilder();
  const graph = graphBuilder.buildGraph(cellSnapshots, neighborRelations);

  console.log(`  Built graph with ${graph.nodeIds.length} nodes`);

  // Get predictions
  const predictions = gnn.predict(graph);
  console.log('\n  Cell SINR Predictions:');
  for (let i = 0; i < graph.nodeIds.length; i++) {
    const cellId = graph.nodeIds[i];
    const params = graph.powerParams.get(cellId)!;
    const status = predictions.sinr[i] < 0 ? 'CRITICAL' : predictions.sinr[i] < 5 ? 'ISSUE' : 'OK';
    console.log(`    ${cellId}: SINR=${predictions.sinr[i].toFixed(1)} dB, IoT=${predictions.iot[i].toFixed(1)} dB, P0=${params.p0}, a=${params.alpha} [${status}]`);
  }

  // Optimize issue cells
  console.log('\n  Optimizing issue cells...');
  const optimizationResults: Array<{ cellId: string; params: { p0: number; alpha: number }; predictedSINR: number }> = [];

  for (const cellId of ['CELL_001', 'CELL_003', 'CELL_005']) {
    try {
      const result = gnn.optimizeCell(cellId, graph, cellSnapshots, neighborRelations);
      console.log(`    ${cellId}: P0 ${result.originalParams.p0}->${result.optimizedParams.p0}, Alpha ${result.originalParams.alpha}->${result.optimizedParams.alpha}`);
      console.log(`           SINR: ${result.originalSINR.toFixed(1)}->${result.optimizedSINR.toFixed(1)} dB (+${result.sinrImprovement.toFixed(1)} dB)`);
      optimizationResults.push({
        cellId,
        params: result.optimizedParams,
        predictedSINR: result.optimizedSINR,
      });
    } catch (e) {
      console.log(`    ${cellId}: Could not optimize - ${(e as Error).message}`);
    }
  }

  // Simulate feedback learning
  console.log('\n  Simulating deployment feedback and learning...');
  for (const opt of optimizationResults) {
    const actualSINR = opt.predictedSINR + (Math.random() - 0.5) * 3;
    const { loss, reward } = gnn.learnFromFeedback(graph, opt.cellId, opt.params, actualSINR);
    console.log(`    ${opt.cellId}: Predicted=${opt.predictedSINR.toFixed(1)}, Actual=${actualSINR.toFixed(1)}, Loss=${loss.toFixed(2)}, Reward=${reward.toFixed(2)}`);
  }

  // Get learning state
  const state = gnn.getState();
  console.log(`\n  Model state: version=${state.modelVersion}, samples=${state.totalSamples}, updates=${state.totalUpdates}`);
}

function demoEricssonOptimizer() {
  console.log('\n' + '='.repeat(70));
  console.log('Demo 5: Ericsson Uplink Optimizer (Production-Ready)');
  console.log('        Large-Scale Network: 500 Cells, 5000 Neighbors');
  console.log('='.repeat(70));

  const optimizer = new EricssonUplinkOptimizer();

  // Create large-scale network
  const cellSnapshots = new Map<string, CellKPISnapshot>();
  const neighborRelations: NeighborRelation[] = [];
  const NUM_CELLS = 500;
  const TARGET_NEIGHBORS = 5000;

  console.log('\n  Building network topology...');

  // Generate cells with varying conditions
  for (let i = 1; i <= NUM_CELLS; i++) {
    const cellId = `CELL_${String(i).padStart(3, '0')}`;
    const rand = (i * 17 + 7) % 100;

    let cellConfig: { sinr: number; iot: number; p0: number; alpha: number };

    if (rand < 10) {
      // Critical cells (10%)
      cellConfig = { sinr: -2 + (rand % 3), iot: 15 + (rand % 5), p0: -90 + (rand % 8), alpha: 0.4 + (rand % 3) * 0.1 };
    } else if (rand < 35) {
      // Issue cells (25%)
      cellConfig = { sinr: 1 + (rand % 4), iot: 11 + (rand % 4), p0: -95 + (rand % 10), alpha: 0.5 + (rand % 4) * 0.1 };
    } else {
      // Healthy cells (65%)
      cellConfig = { sinr: 10 + (rand % 12), iot: 3 + (rand % 5), p0: -100 + (rand % 8), alpha: 0.7 + (rand % 4) * 0.1 };
    }

    cellSnapshots.set(cellId, generateSampleCellSnapshot(cellId, cellConfig));
  }

  // Generate neighbor relations - target 5000 relations (avg 10 neighbors per cell)
  const cellIds = Array.from(cellSnapshots.keys());
  const neighborsPerCell = Math.ceil(TARGET_NEIGHBORS / NUM_CELLS);
  for (let i = 0; i < NUM_CELLS && neighborRelations.length < TARGET_NEIGHBORS; i++) {
    for (let offset = 1; offset <= neighborsPerCell && neighborRelations.length < TARGET_NEIGHBORS; offset++) {
      const j = (i + offset) % NUM_CELLS;
      if (i !== j) {
        neighborRelations.push(generateSampleNeighborRelation(cellIds[i], cellIds[j]));
      }
    }
  }

  console.log(`  Created network with ${cellSnapshots.size} cells and ${neighborRelations.length} neighbor relations`);

  // Calculate baseline statistics
  let criticalCount = 0;
  let issueCount = 0;
  let healthyCount = 0;
  let sinrSum = 0;
  let iotSum = 0;
  const sinrValues: number[] = [];
  const iotValues: number[] = [];
  const p0Values: number[] = [];
  const alphaValues: number[] = [];
  const criticalCells: string[] = [];
  const issueCells: string[] = [];

  for (const [cellId, snapshot] of cellSnapshots) {
    const sinr = snapshot.radioQuality.ulSinrAvg;
    const iot = snapshot.uplinkInterference.iotAvg;
    const p0 = snapshot.uplinkPowerControl.p0NominalPusch;
    const alpha = snapshot.uplinkPowerControl.alpha;

    sinrSum += sinr;
    iotSum += iot;
    sinrValues.push(sinr);
    iotValues.push(iot);
    p0Values.push(p0);
    alphaValues.push(alpha);

    if (sinr < 0) {
      criticalCount++;
      criticalCells.push(cellId);
    } else if (sinr < 5) {
      issueCount++;
      issueCells.push(cellId);
    } else {
      healthyCount++;
    }
  }

  // Statistical analysis
  const avgSinr = sinrSum / NUM_CELLS;
  const avgIot = iotSum / NUM_CELLS;
  const sinrStdDev = Math.sqrt(sinrValues.reduce((sum, v) => sum + Math.pow(v - avgSinr, 2), 0) / NUM_CELLS);
  const iotStdDev = Math.sqrt(iotValues.reduce((sum, v) => sum + Math.pow(v - avgIot, 2), 0) / NUM_CELLS);

  // P0 and Alpha distribution analysis
  const p0Distribution = new Map<number, number>();
  const alphaDistribution = new Map<number, number>();
  for (const p0 of p0Values) p0Distribution.set(p0, (p0Distribution.get(p0) || 0) + 1);
  for (const alpha of alphaValues) alphaDistribution.set(alpha, (alphaDistribution.get(alpha) || 0) + 1);

  console.log('\n' + '-'.repeat(70));
  console.log('  BASELINE NETWORK ANALYSIS');
  console.log('-'.repeat(70));
  console.log(`\n  Cell Distribution:`);
  console.log(`    Critical (SINR < 0 dB):  ${criticalCount} cells (${(criticalCount/NUM_CELLS*100).toFixed(1)}%)`);
  console.log(`    Issue (0 <= SINR < 5 dB): ${issueCount} cells (${(issueCount/NUM_CELLS*100).toFixed(1)}%)`);
  console.log(`    Healthy (SINR >= 5 dB):  ${healthyCount} cells (${(healthyCount/NUM_CELLS*100).toFixed(1)}%)`);

  console.log(`\n  SINR Statistics:`);
  console.log(`    Average: ${avgSinr.toFixed(2)} dB`);
  console.log(`    Std Dev: ${sinrStdDev.toFixed(2)} dB`);
  console.log(`    Min: ${Math.min(...sinrValues).toFixed(1)} dB`);
  console.log(`    Max: ${Math.max(...sinrValues).toFixed(1)} dB`);

  console.log(`\n  IoT (Interference over Thermal) Statistics:`);
  console.log(`    Average: ${avgIot.toFixed(2)} dB`);
  console.log(`    Std Dev: ${iotStdDev.toFixed(2)} dB`);
  console.log(`    Min: ${Math.min(...iotValues).toFixed(1)} dB`);
  console.log(`    Max: ${Math.max(...iotValues).toFixed(1)} dB`);

  console.log(`\n  P0 Nominal PUSCH Distribution (pZeroNominalPusch):`);
  const sortedP0 = [...p0Distribution.entries()].sort((a, b) => a[0] - b[0]);
  for (const [p0, count] of sortedP0.slice(0, 10)) {
    const bar = '#'.repeat(Math.ceil(count / 10));
    console.log(`    ${p0} dBm: ${count.toString().padStart(3)} cells ${bar}`);
  }
  if (sortedP0.length > 10) console.log(`    ... and ${sortedP0.length - 10} more values`);

  console.log(`\n  Alpha Distribution:`);
  const sortedAlpha = [...alphaDistribution.entries()].sort((a, b) => a[0] - b[0]);
  for (const [alpha, count] of sortedAlpha) {
    const bar = '#'.repeat(Math.ceil(count / 10));
    console.log(`    ${alpha.toFixed(1)}: ${count.toString().padStart(3)} cells ${bar}`);
  }

  // Run optimization
  console.log('\n' + '-'.repeat(70));
  console.log('  RUNNING NETWORK-WIDE OPTIMIZATION');
  console.log('-'.repeat(70));
  const startTime = Date.now();
  const result = optimizer.optimizeNetwork(cellSnapshots, neighborRelations);
  const elapsed = Date.now() - startTime;

  console.log(`\n  Optimization completed in ${elapsed}ms`);
  console.log(`  Processing rate: ${(NUM_CELLS / (elapsed / 1000)).toFixed(0)} cells/second`);

  // Deep analysis of optimization results
  console.log('\n' + '-'.repeat(70));
  console.log('  OPTIMIZATION RESULTS ANALYSIS');
  console.log('-'.repeat(70));

  const totalImprovement = result.results.reduce((sum, r) => sum + r.sinrImprovement, 0);
  const avgImprovement = result.results.length > 0 ? totalImprovement / result.results.length : 0;

  console.log(`\n  Summary:`);
  console.log(`    Cells optimized: ${result.results.length} of ${criticalCount + issueCount} problematic cells`);
  console.log(`    Average SINR improvement: +${avgImprovement.toFixed(2)} dB per cell`);
  console.log(`    Total network SINR gain: +${totalImprovement.toFixed(1)} dB`);

  // Analyze P0 changes
  const p0Changes = result.results.map(r => r.optimizedParams.p0 - r.originalParams.p0);
  const alphaChanges = result.results.map(r => r.optimizedParams.alpha - r.originalParams.alpha);
  const avgP0Change = p0Changes.length > 0 ? p0Changes.reduce((a, b) => a + b, 0) / p0Changes.length : 0;
  const avgAlphaChange = alphaChanges.length > 0 ? alphaChanges.reduce((a, b) => a + b, 0) / alphaChanges.length : 0;

  console.log(`\n  P0 Nominal PUSCH Parameter Changes:`);
  console.log(`    Average change: ${avgP0Change >= 0 ? '+' : ''}${avgP0Change.toFixed(1)} dBm`);
  console.log(`    Range: ${Math.min(...p0Changes)} to ${Math.max(...p0Changes)} dBm`);

  // P0 change distribution
  const p0Increased = p0Changes.filter(c => c > 0).length;
  const p0Decreased = p0Changes.filter(c => c < 0).length;
  const p0Unchanged = p0Changes.filter(c => c === 0).length;
  console.log(`    Increased: ${p0Increased} cells (higher UE TX power target)`);
  console.log(`    Decreased: ${p0Decreased} cells (lower UE TX power target)`);
  console.log(`    Unchanged: ${p0Unchanged} cells`);

  console.log(`\n  Alpha Parameter Changes:`);
  console.log(`    Average change: ${avgAlphaChange >= 0 ? '+' : ''}${avgAlphaChange.toFixed(2)}`);
  console.log(`    Range: ${Math.min(...alphaChanges).toFixed(1)} to ${Math.max(...alphaChanges).toFixed(1)}`);

  const alphaIncreased = alphaChanges.filter(c => c > 0).length;
  const alphaDecreased = alphaChanges.filter(c => c < 0).length;
  const alphaUnchanged = alphaChanges.filter(c => c === 0).length;
  console.log(`    Increased: ${alphaIncreased} cells (more path loss compensation)`);
  console.log(`    Decreased: ${alphaDecreased} cells (less path loss compensation)`);
  console.log(`    Unchanged: ${alphaUnchanged} cells`);

  // Correlation analysis between P0, Alpha, and SINR improvement
  console.log(`\n  Parameter-SINR Improvement Correlation Analysis:`);

  // Group by P0 change magnitude
  const p0ImpactGroups = new Map<string, number[]>();
  for (let i = 0; i < result.results.length; i++) {
    const p0Change = p0Changes[i];
    const group = p0Change > 5 ? 'large_inc' : p0Change > 0 ? 'small_inc' : p0Change === 0 ? 'none' : p0Change > -5 ? 'small_dec' : 'large_dec';
    if (!p0ImpactGroups.has(group)) p0ImpactGroups.set(group, []);
    p0ImpactGroups.get(group)!.push(result.results[i].sinrImprovement);
  }

  console.log(`\n    P0 Change Impact on SINR Improvement:`);
  for (const [group, improvements] of p0ImpactGroups) {
    const avgImp = improvements.reduce((a, b) => a + b, 0) / improvements.length;
    const label = {
      'large_inc': 'P0 +6 to +10 dBm',
      'small_inc': 'P0 +1 to +5 dBm',
      'none': 'P0 unchanged',
      'small_dec': 'P0 -1 to -5 dBm',
      'large_dec': 'P0 -6 to -10 dBm'
    }[group] || group;
    console.log(`      ${label}: ${improvements.length} cells, avg SINR +${avgImp.toFixed(2)} dB`);
  }

  // Group by Alpha change
  const alphaImpactGroups = new Map<string, number[]>();
  for (let i = 0; i < result.results.length; i++) {
    const alphaChange = alphaChanges[i];
    const group = alphaChange > 0.2 ? 'large_inc' : alphaChange > 0 ? 'small_inc' : alphaChange === 0 ? 'none' : 'decreased';
    if (!alphaImpactGroups.has(group)) alphaImpactGroups.set(group, []);
    alphaImpactGroups.get(group)!.push(result.results[i].sinrImprovement);
  }

  console.log(`\n    Alpha Change Impact on SINR Improvement:`);
  for (const [group, improvements] of alphaImpactGroups) {
    const avgImp = improvements.reduce((a, b) => a + b, 0) / improvements.length;
    const label = {
      'large_inc': 'Alpha +0.3 to +0.6',
      'small_inc': 'Alpha +0.1 to +0.2',
      'none': 'Alpha unchanged',
      'decreased': 'Alpha decreased'
    }[group] || group;
    console.log(`      ${label}: ${improvements.length} cells, avg SINR +${avgImp.toFixed(2)} dB`);
  }

  // Show optimized parameter distributions
  const newP0Distribution = new Map<number, number>();
  const newAlphaDistribution = new Map<number, number>();
  for (const r of result.results) {
    newP0Distribution.set(r.optimizedParams.p0, (newP0Distribution.get(r.optimizedParams.p0) || 0) + 1);
    newAlphaDistribution.set(r.optimizedParams.alpha, (newAlphaDistribution.get(r.optimizedParams.alpha) || 0) + 1);
  }

  console.log(`\n  Optimized P0 Distribution:`);
  const sortedNewP0 = [...newP0Distribution.entries()].sort((a, b) => a[0] - b[0]);
  for (const [p0, count] of sortedNewP0) {
    const bar = '#'.repeat(Math.ceil(count / 5));
    console.log(`    ${p0} dBm: ${count.toString().padStart(3)} cells ${bar}`);
  }

  console.log(`\n  Optimized Alpha Distribution:`);
  const sortedNewAlpha = [...newAlphaDistribution.entries()].sort((a, b) => a[0] - b[0]);
  for (const [alpha, count] of sortedNewAlpha) {
    const bar = '#'.repeat(Math.ceil(count / 5));
    console.log(`    ${alpha.toFixed(1)}: ${count.toString().padStart(3)} cells ${bar}`);
  }

  // Show top optimizations
  if (result.results.length > 0) {
    console.log(`\n  Top 10 Most Improved Cells:`);
    const sorted = [...result.results].sort((a, b) => b.sinrImprovement - a.sinrImprovement);
    console.log('    ' + '-'.repeat(66));
    console.log('    Cell ID     | P0 Change     | Alpha Change | SINR Improvement');
    console.log('    ' + '-'.repeat(66));
    for (const r of sorted.slice(0, 10)) {
      const p0Change = r.optimizedParams.p0 - r.originalParams.p0;
      const alphaChange = r.optimizedParams.alpha - r.originalParams.alpha;
      console.log(`    ${r.cellId} | ${r.originalParams.p0} -> ${r.optimizedParams.p0} (${p0Change >= 0 ? '+' : ''}${p0Change}) | ${r.originalParams.alpha} -> ${r.optimizedParams.alpha} (${alphaChange >= 0 ? '+' : ''}${alphaChange.toFixed(1)}) | +${r.sinrImprovement.toFixed(1)} dB`);
    }
    console.log('    ' + '-'.repeat(66));
  }

  // Network-wide impact assessment
  console.log('\n' + '-'.repeat(70));
  console.log('  NETWORK-WIDE IMPACT ASSESSMENT');
  console.log('-'.repeat(70));

  // Estimate new network state
  let newCriticalCount = criticalCount;
  let newIssueCount = issueCount;
  let resolvedCritical = 0;
  let resolvedIssue = 0;

  for (const r of result.results) {
    const originalSinr = r.originalSINR;
    const newSinr = r.optimizedSINR;

    if (originalSinr < 0 && newSinr >= 0) {
      resolvedCritical++;
      newCriticalCount--;
      if (newSinr < 5) newIssueCount++;
    } else if (originalSinr >= 0 && originalSinr < 5 && newSinr >= 5) {
      resolvedIssue++;
      newIssueCount--;
    }
  }

  console.log(`\n  Problem Resolution:`);
  console.log(`    Critical cells resolved: ${resolvedCritical} of ${criticalCount} (${(resolvedCritical/criticalCount*100).toFixed(1)}%)`);
  console.log(`    Issue cells resolved: ${resolvedIssue} of ${issueCount} (${(resolvedIssue/issueCount*100).toFixed(1)}%)`);
  console.log(`\n  Post-Optimization Cell Distribution:`);
  console.log(`    Critical: ${criticalCount} -> ${newCriticalCount} cells`);
  console.log(`    Issue: ${issueCount} -> ${newIssueCount} cells`);
  console.log(`    Healthy: ${healthyCount} -> ${healthyCount + resolvedCritical + resolvedIssue} cells`);

  // Engineering recommendations
  console.log('\n' + '-'.repeat(70));
  console.log('  ENGINEERING RECOMMENDATIONS');
  console.log('-'.repeat(70));

  console.log(`\n  Based on the optimization analysis:`);
  console.log(`\n  1. P0 Nominal PUSCH Tuning:`);
  if (avgP0Change > 0) {
    console.log(`     - The network benefits from HIGHER P0 values on average`);
    console.log(`     - Cells with low SINR should increase P0 by ${Math.round(avgP0Change)} dBm`);
    console.log(`     - This increases UE transmit power, improving SINR at the cost of`);
    console.log(`       slightly higher interference to neighboring cells`);
  } else {
    console.log(`     - The network benefits from LOWER P0 values on average`);
    console.log(`     - This reduces overall interference while maintaining adequate SINR`);
  }

  console.log(`\n  2. Alpha Parameter Tuning:`);
  if (avgAlphaChange > 0) {
    console.log(`     - Cells benefit from HIGHER alpha values (closer to 1.0)`);
    console.log(`     - Full path loss compensation helps cell-edge users`);
    console.log(`     - Recommended alpha for problematic cells: 0.9 - 1.0`);
  } else {
    console.log(`     - Some cells may benefit from LOWER alpha values`);
    console.log(`     - Partial path loss compensation can reduce inter-cell interference`);
  }

  console.log(`\n  3. Priority Actions:`);
  console.log(`     - Focus on ${criticalCount} critical cells first (SINR < 0 dB)`);
  console.log(`     - Apply P0 increases of 5-10 dBm for cells with severe interference`);
  console.log(`     - Set alpha = 1.0 for cell-edge performance issues`);
  console.log(`     - Monitor IoT levels after changes to avoid interference propagation`);
}

function demoTensorCompression() {
  console.log('\n' + '='.repeat(70));
  console.log('Demo 6: RuVector Tensor Compression');
  console.log('='.repeat(70));

  // Create sample embeddings
  const embeddings = Array(100).fill(null).map(() =>
    Array(64).fill(0).map(() => Math.random() * 2 - 1)
  );

  console.log(`  Created embeddings: ${embeddings.length} x ${embeddings[0].length}`);

  // Test different compression levels
  const levels: Array<'none' | 'half' | 'pq8' | 'pq4' | 'binary'> = ['none', 'half', 'pq8', 'pq4', 'binary'];

  for (const level of levels) {
    const compressed = compressEmbeddings(embeddings, level, 0.5);
    const bytesPerElement = level === 'none' ? 4 : level === 'half' ? 4 : level === 'binary' ? 1 : 1;
    const compressionRatio = (4 / bytesPerElement);
    console.log(`  ${level.padEnd(6)}: ${compressed.shape.join('x')}, compression ratio: ${compressionRatio}x`);
  }
}

function demoDifferentiableSearchVectors() {
  console.log('\n' + '='.repeat(70));
  console.log('Demo 7: Differentiable Vector Search');
  console.log('='.repeat(70));

  // Create query and candidates
  const query = Array(64).fill(0).map(() => Math.random() * 2 - 1);
  const candidates = Array(1000).fill(null).map(() =>
    Array(64).fill(0).map(() => Math.random() * 2 - 1)
  );

  console.log(`  Query vector: 64 dimensions`);
  console.log(`  Candidate vectors: 1000 x 64`);

  // Search with different temperatures
  for (const temp of [0.1, 1.0, 5.0]) {
    const result = differentiableSearch(query, candidates, 5, temp);
    const entropy = -result.softWeights.reduce((sum, w) => sum + (w > 0 ? w * Math.log(w) : 0), 0);
    console.log(`  Temperature ${temp}: top indices [${result.indices.slice(0, 3).join(', ')}...], entropy=${entropy.toFixed(2)}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('   RUVECTOR SELF-LEARNING GNN FOR ERICSSON UPLINK OPTIMIZATION');
  console.log('   Unified Demo');
  console.log('='.repeat(70));

  try {
    await demoRuVectorGNNLayer();
    demoExperienceReplay();
    demoDifferentiableSearch();
    await demoSelfLearningGNN();
    demoEricssonOptimizer();
    demoTensorCompression();
    demoDifferentiableSearchVectors();

    console.log('\n' + '='.repeat(70));
    console.log('   ALL DEMOS COMPLETED SUCCESSFULLY');
    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error('\nError running demo:', error);
    process.exit(1);
  }
}

main();
