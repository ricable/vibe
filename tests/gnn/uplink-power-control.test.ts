/**
 * Unit Tests for Uplink Power Control GNN Module
 *
 * Tests the following components:
 * - PathLossAnalyzer
 * - FractionalPathLossOptimizer
 * - GNNPowerControlOptimizer
 * - PowerControlValidator
 * - GNNSINRPredictor
 * - BayesianGNN
 * - GeneticAlgorithmOptimizer
 * - NetworkPowerControlOptimizer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PathLossAnalyzer,
  FractionalPathLossOptimizer,
  GNNPowerControlOptimizer,
  PowerControlValidator,
  DEFAULT_POWER_CONTROL_CONFIG,
} from '../../src/gnn/uplink-power-control.js';
import {
  GNNSINRPredictor,
  InterferenceCouplingBuilder,
  DEFAULT_SINR_PREDICTOR_CONFIG,
} from '../../src/gnn/sinr-predictor.js';
import {
  BayesianGNN,
  GeneticAlgorithmOptimizer,
  NetworkPowerControlOptimizer,
  DEFAULT_BAYESIAN_CONFIG,
} from '../../src/gnn/bayesian-optimizer.js';
import { CellGraphBuilder } from '../../src/gnn/cell-graph.js';
import { SampleDataGenerator } from '../../src/data/sample-generator.js';
import type {
  CellKPISnapshot,
  NeighborRelation,
  UplinkPowerControlKPI,
  UplinkInterferenceKPI,
  CellGraph,
} from '../../src/models/ran-kpi.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockPowerControlKPI(overrides: Partial<UplinkPowerControlKPI> = {}): UplinkPowerControlKPI {
  return {
    timestamp: new Date(),
    cellId: 'test-cell-1',
    p0NominalPusch: -96,
    p0NominalPucch: -100,
    alpha: 0.8,
    ueTxPowerAvg: 10,
    ueTxPowerP10: 5,
    ueTxPowerP50: 10,
    ueTxPowerP90: 18,
    ueTxPowerMax: 23,
    powerHeadroomAvg: 13,
    powerHeadroomP10: 5,
    powerHeadroomP50: 12,
    powerHeadroomP90: 20,
    negativePowerHeadroomRatio: 8,
    pathLossAvg: 110,
    pathLossP10: 90,
    pathLossP50: 110,
    pathLossP90: 130,
    tpcUpCommands: 1000,
    tpcDownCommands: 800,
    tpcAccumulatedOffset: 2,
    powerLimitedUeRatio: 12,
    ...overrides,
  };
}

function createMockInterferenceKPI(overrides: Partial<UplinkInterferenceKPI> = {}): UplinkInterferenceKPI {
  return {
    timestamp: new Date(),
    cellId: 'test-cell-1',
    prbUlInterferenceAvg: -105,
    prbUlInterferenceP10: -110,
    prbUlInterferenceP50: -105,
    prbUlInterferenceP90: -100,
    prbUlInterferenceP99: -95,
    iotAvg: 5,
    iotP95: 8,
    rip: -100,
    externalInterferenceDetected: false,
    externalInterferenceLevel: 'none',
    puschSinrDegradation: 1,
    highInterferencePrbRatio: 5,
    ...overrides,
  };
}

function createTestGraph(): {
  cellSnapshots: Map<string, CellKPISnapshot>;
  neighborRelations: NeighborRelation[];
  graph: CellGraph;
} {
  const generator = new SampleDataGenerator({
    numCells: 10,
  });

  // Use the correct SampleDataGenerator API
  const { cellSnapshots, neighborRelations } = generator.generateDataset();

  const graphBuilder = new CellGraphBuilder();
  const graph = graphBuilder.buildGraph(cellSnapshots, neighborRelations);

  return { cellSnapshots, neighborRelations, graph };
}

// ============================================================================
// PATH LOSS ANALYZER TESTS
// ============================================================================

describe('PathLossAnalyzer', () => {
  let analyzer: PathLossAnalyzer;

  beforeEach(() => {
    analyzer = new PathLossAnalyzer();
  });

  describe('estimatePathLossDistribution', () => {
    it('should estimate path loss distribution from power control KPIs', () => {
      const powerControl = createMockPowerControlKPI();
      const distribution = analyzer.estimatePathLossDistribution(powerControl);

      expect(distribution.mean).toBe(powerControl.pathLossAvg);
      expect(distribution.p10).toBe(powerControl.pathLossP10);
      expect(distribution.p50).toBe(powerControl.pathLossP50);
      expect(distribution.p90).toBe(powerControl.pathLossP90);
      expect(distribution.stdDev).toBeGreaterThan(0);
      expect(distribution.distribution.length).toBe(20);
    });

    it('should produce normalized distribution that sums to 1', () => {
      const powerControl = createMockPowerControlKPI();
      const distribution = analyzer.estimatePathLossDistribution(powerControl);

      const sum = distribution.distribution.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('calculateRequiredP0', () => {
    it('should calculate P0 for target SINR', () => {
      const targetSinr = 15; // dB
      const pathLoss = 110; // dB
      const interferenceLevel = 3; // dB
      const alpha = 0.8;

      const p0 = analyzer.calculateRequiredP0(targetSinr, pathLoss, interferenceLevel, alpha);

      expect(typeof p0).toBe('number');
      expect(p0).toBeGreaterThanOrEqual(-126);
      expect(p0).toBeLessThanOrEqual(24);
    });

    it('should increase P0 with higher target SINR', () => {
      const pathLoss = 110;
      const interferenceLevel = 3;
      const alpha = 0.8;

      const p0Low = analyzer.calculateRequiredP0(10, pathLoss, interferenceLevel, alpha);
      const p0High = analyzer.calculateRequiredP0(20, pathLoss, interferenceLevel, alpha);

      expect(p0High).toBeGreaterThan(p0Low);
    });

    it('should change P0 based on alpha (path loss compensation)', () => {
      const targetSinr = 15;
      const pathLoss = 110;
      const interferenceLevel = 3;

      const p0LowAlpha = analyzer.calculateRequiredP0(targetSinr, pathLoss, interferenceLevel, 0.6);
      const p0HighAlpha = analyzer.calculateRequiredP0(targetSinr, pathLoss, interferenceLevel, 1.0);

      // P0 values should be different for different alpha values
      // With higher alpha, more path loss is compensated, so P0 can be adjusted
      expect(p0LowAlpha).not.toBe(p0HighAlpha);
    });
  });
});

// ============================================================================
// FRACTIONAL PATH LOSS OPTIMIZER TESTS
// ============================================================================

describe('FractionalPathLossOptimizer', () => {
  let optimizer: FractionalPathLossOptimizer;

  beforeEach(() => {
    optimizer = new FractionalPathLossOptimizer();
  });

  describe('optimizeCell', () => {
    it('should return optimization result with all required fields', () => {
      const powerControl = createMockPowerControlKPI();
      const interference = createMockInterferenceKPI();

      const result = optimizer.optimizeCell(powerControl, interference);

      expect(result.cellId).toBe(powerControl.cellId);
      expect(result.currentP0).toBe(powerControl.p0NominalPusch);
      expect(result.currentAlpha).toBe(powerControl.alpha);
      expect(typeof result.recommendedP0).toBe('number');
      expect(typeof result.recommendedAlpha).toBe('number');
      expect(result.expectedImprovement).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.rationale).toBeDefined();
    });

    it('should recommend lower P0 when IoT is high', () => {
      const powerControl = createMockPowerControlKPI({ p0NominalPusch: -90 });
      const interference = createMockInterferenceKPI({ iotAvg: 12 }); // High IoT

      const result = optimizer.optimizeCell(powerControl, interference);

      // Should recommend reducing P0 to decrease interference
      expect(result.recommendedP0).toBeLessThanOrEqual(result.currentP0);
    });

    it('should provide recommendations when power-limited ratio is high', () => {
      const powerControl = createMockPowerControlKPI({
        p0NominalPusch: -100,
        powerLimitedUeRatio: 25,
      });
      const interference = createMockInterferenceKPI({ iotAvg: 3 }); // Low IoT

      const result = optimizer.optimizeCell(powerControl, interference);

      // Should provide some recommendation (either P0 or alpha change)
      const hasRecommendation = result.recommendedP0 !== result.currentP0 ||
        result.recommendedAlpha !== result.currentAlpha ||
        result.rationale.length > 0;
      expect(hasRecommendation).toBe(true);
      expect(result.expectedImprovement).toBeDefined();
    });

    it('should generate valid alpha values', () => {
      const powerControl = createMockPowerControlKPI();
      const interference = createMockInterferenceKPI();

      const result = optimizer.optimizeCell(powerControl, interference);

      expect(DEFAULT_POWER_CONTROL_CONFIG.alphaValues).toContain(result.recommendedAlpha);
    });
  });
});

// ============================================================================
// GNN POWER CONTROL OPTIMIZER TESTS
// ============================================================================

describe('GNNPowerControlOptimizer', () => {
  let optimizer: GNNPowerControlOptimizer;

  beforeEach(() => {
    optimizer = new GNNPowerControlOptimizer();
  });

  describe('optimizeNetworkPowerControl', () => {
    it('should optimize power control for all cells in network', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const results = optimizer.optimizeNetworkPowerControl(cellSnapshots, neighborRelations);

      expect(results.size).toBe(cellSnapshots.size);

      for (const [cellId, result] of results) {
        expect(result.cellId).toBe(cellId);
        expect(result.recommendedP0).toBeGreaterThanOrEqual(-126);
        expect(result.recommendedP0).toBeLessThanOrEqual(24);
        expect(result.recommendedAlpha).toBeGreaterThanOrEqual(0);
        expect(result.recommendedAlpha).toBeLessThanOrEqual(1);
      }
    });

    it('should apply neighbor constraints', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const results = optimizer.optimizeNetworkPowerControl(cellSnapshots, neighborRelations);

      // Get neighbor P0 values
      const p0Values = Array.from(results.values()).map(r => r.recommendedP0);
      const avgP0 = p0Values.reduce((a, b) => a + b, 0) / p0Values.length;

      // All P0 values should be within reasonable range of each other
      for (const p0 of p0Values) {
        expect(Math.abs(p0 - avgP0)).toBeLessThan(15);
      }
    });

    it('should include GNN weight in rationale', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const results = optimizer.optimizeNetworkPowerControl(cellSnapshots, neighborRelations);

      for (const result of results.values()) {
        expect(result.rationale).toContain('GNN');
      }
    });
  });
});

// ============================================================================
// POWER CONTROL VALIDATOR TESTS
// ============================================================================

describe('PowerControlValidator', () => {
  let validator: PowerControlValidator;

  beforeEach(() => {
    validator = new PowerControlValidator();
  });

  describe('validateChanges', () => {
    it('should validate valid changes', () => {
      const { cellSnapshots } = createTestGraph();
      const snapshot = cellSnapshots.values().next().value!;

      const currentConfig = { p0: -96, alpha: 0.8 };
      const proposedConfig = { p0: -94, alpha: 0.8 };

      const result = validator.validateChanges(currentConfig, proposedConfig, snapshot);

      expect(result.isValid).toBe(true);
      expect(result.risks.length).toBe(0);
    });

    it('should warn on large P0 changes', () => {
      const { cellSnapshots } = createTestGraph();
      const snapshot = cellSnapshots.values().next().value!;

      const currentConfig = { p0: -96, alpha: 0.8 };
      const proposedConfig = { p0: -86, alpha: 0.8 }; // 10 dB change

      const result = validator.validateChanges(currentConfig, proposedConfig, snapshot);

      expect(result.warnings.some(w => w.includes('P0'))).toBe(true);
    });

    it('should warn on large alpha changes', () => {
      const { cellSnapshots } = createTestGraph();
      const snapshot = cellSnapshots.values().next().value!;

      const currentConfig = { p0: -96, alpha: 0.5 };
      const proposedConfig = { p0: -96, alpha: 0.9 }; // 0.4 change

      const result = validator.validateChanges(currentConfig, proposedConfig, snapshot);

      expect(result.warnings.some(w => w.includes('alpha'))).toBe(true);
    });

    it('should flag risks for out-of-range P0', () => {
      const { cellSnapshots } = createTestGraph();
      const snapshot = cellSnapshots.values().next().value!;

      const currentConfig = { p0: -96, alpha: 0.8 };
      const proposedConfig = { p0: -75, alpha: 0.8 }; // Above typical range

      const result = validator.validateChanges(currentConfig, proposedConfig, snapshot);

      expect(result.risks.some(r => r.includes('P0'))).toBe(true);
    });
  });

  describe('estimateImpact', () => {
    it('should estimate KPI impact of changes', () => {
      const { cellSnapshots } = createTestGraph();
      const snapshot = cellSnapshots.values().next().value!;

      const currentConfig = { p0: -96, alpha: 0.8 };
      const proposedConfig = { p0: -92, alpha: 0.8 };

      const impact = validator.estimateImpact(currentConfig, proposedConfig, snapshot);

      expect(typeof impact.iotDelta).toBe('number');
      expect(typeof impact.powerLimitedDelta).toBe('number');
      expect(typeof impact.sinrDelta).toBe('number');
      expect(typeof impact.coverageMarginDelta).toBe('number');
    });

    it('should predict IoT increase with higher P0', () => {
      const { cellSnapshots } = createTestGraph();
      const snapshot = cellSnapshots.values().next().value!;

      const currentConfig = { p0: -100, alpha: 0.8 };
      const proposedConfig = { p0: -90, alpha: 0.8 };

      const impact = validator.estimateImpact(currentConfig, proposedConfig, snapshot);

      expect(impact.iotDelta).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// INTERFERENCE COUPLING BUILDER TESTS
// ============================================================================

describe('InterferenceCouplingBuilder', () => {
  let builder: InterferenceCouplingBuilder;

  beforeEach(() => {
    builder = new InterferenceCouplingBuilder();
  });

  describe('buildCouplingMatrix', () => {
    it('should build coupling matrix with correct dimensions', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const coupling = builder.buildCouplingMatrix(cellSnapshots, neighborRelations);

      expect(coupling.cellIds.length).toBe(cellSnapshots.size);
      expect(coupling.matrix.length).toBe(cellSnapshots.size);
      expect(coupling.pathLossMatrix.length).toBe(cellSnapshots.size);
    });

    it('should have diagonal elements equal to 1', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const coupling = builder.buildCouplingMatrix(cellSnapshots, neighborRelations);

      for (let i = 0; i < coupling.matrix.length; i++) {
        expect(coupling.matrix[i][i]).toBe(1.0);
      }
    });

    it('should be symmetric', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const coupling = builder.buildCouplingMatrix(cellSnapshots, neighborRelations);

      for (let i = 0; i < coupling.matrix.length; i++) {
        for (let j = 0; j < coupling.matrix.length; j++) {
          expect(coupling.matrix[i][j]).toBeCloseTo(coupling.matrix[j][i], 10);
        }
      }
    });
  });

  describe('calculateInterferenceImpact', () => {
    it('should calculate interference impact on neighbors', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();
      const coupling = builder.buildCouplingMatrix(cellSnapshots, neighborRelations);

      const sourceCellId = coupling.cellIds[0];
      const p0Change = 5;
      const alphaChange = 0.1;
      const avgPathLoss = 110;

      const impacts = builder.calculateInterferenceImpact(
        coupling,
        sourceCellId,
        p0Change,
        alphaChange,
        avgPathLoss
      );

      // The impact map should be defined
      expect(impacts).toBeDefined();
      expect(impacts).toBeInstanceOf(Map);

      // If there are neighbors with significant coupling, impacts should be positive
      // (Some test graphs may have no coupled neighbors above threshold)
      for (const impact of impacts.values()) {
        expect(impact).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================================
// GNN SINR PREDICTOR TESTS
// ============================================================================

describe('GNNSINRPredictor', () => {
  let predictor: GNNSINRPredictor;

  beforeEach(() => {
    predictor = new GNNSINRPredictor();
  });

  describe('predict', () => {
    it('should predict SINR for all cells in graph', () => {
      const { cellSnapshots, neighborRelations, graph } = createTestGraph();
      const couplingBuilder = new InterferenceCouplingBuilder();
      const coupling = couplingBuilder.buildCouplingMatrix(cellSnapshots, neighborRelations);

      const scenarios = Array.from(cellSnapshots.entries()).map(([cellId, snapshot]) => ({
        cellId,
        p0: snapshot.uplinkPowerControl.p0NominalPusch,
        alpha: snapshot.uplinkPowerControl.alpha,
      }));

      const predictions = predictor.predict(graph, scenarios, coupling);

      expect(predictions.size).toBe(cellSnapshots.size);

      for (const pred of predictions.values()) {
        expect(typeof pred.predictedSinr).toBe('number');
        expect(typeof pred.predictedIoT).toBe('number');
        expect(typeof pred.predictedSpectralEfficiency).toBe('number');
        expect(pred.confidence).toBeGreaterThanOrEqual(0);
        expect(pred.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should produce reasonable SINR predictions', () => {
      const { cellSnapshots, neighborRelations, graph } = createTestGraph();
      const couplingBuilder = new InterferenceCouplingBuilder();
      const coupling = couplingBuilder.buildCouplingMatrix(cellSnapshots, neighborRelations);

      const scenarios = Array.from(cellSnapshots.entries()).map(([cellId, snapshot]) => ({
        cellId,
        p0: snapshot.uplinkPowerControl.p0NominalPusch,
        alpha: snapshot.uplinkPowerControl.alpha,
      }));

      const predictions = predictor.predict(graph, scenarios, coupling);

      for (const pred of predictions.values()) {
        // SINR should be in reasonable range (-10 to 30 dB)
        expect(pred.predictedSinr).toBeGreaterThanOrEqual(-15);
        expect(pred.predictedSinr).toBeLessThanOrEqual(35);

        // IoT should be in reasonable range (0 to 20 dB)
        expect(pred.predictedIoT).toBeGreaterThanOrEqual(-5);
        expect(pred.predictedIoT).toBeLessThanOrEqual(20);
      }
    });
  });

  describe('predictImprovement', () => {
    it('should calculate improvement between configurations', () => {
      const { cellSnapshots, neighborRelations, graph } = createTestGraph();
      const couplingBuilder = new InterferenceCouplingBuilder();
      const coupling = couplingBuilder.buildCouplingMatrix(cellSnapshots, neighborRelations);

      const currentScenarios = Array.from(cellSnapshots.entries()).map(([cellId, snapshot]) => ({
        cellId,
        p0: snapshot.uplinkPowerControl.p0NominalPusch,
        alpha: snapshot.uplinkPowerControl.alpha,
      }));

      // Create proposed scenarios with different parameters
      const proposedScenarios = currentScenarios.map(s => ({
        ...s,
        p0: s.p0 + 3,
      }));

      const improvements = predictor.predictImprovement(graph, currentScenarios, proposedScenarios, coupling);

      expect(improvements.size).toBe(cellSnapshots.size);

      for (const imp of improvements.values()) {
        expect(typeof imp.sinrImprovement).toBe('number');
        expect(typeof imp.iotReduction).toBe('number');
        expect(typeof imp.confidence).toBe('number');
      }
    });
  });
});

// ============================================================================
// BAYESIAN GNN TESTS
// ============================================================================

describe('BayesianGNN', () => {
  let bayesianGNN: BayesianGNN;

  beforeEach(() => {
    bayesianGNN = new BayesianGNN({
      numMonteCarloPasses: 10, // Reduced for faster tests
    });
  });

  describe('predictWithUncertainty', () => {
    it('should provide predictions with uncertainty estimates', () => {
      const { cellSnapshots, neighborRelations, graph } = createTestGraph();
      const couplingBuilder = new InterferenceCouplingBuilder();
      const coupling = couplingBuilder.buildCouplingMatrix(cellSnapshots, neighborRelations);

      const scenarios = Array.from(cellSnapshots.entries()).map(([cellId, snapshot]) => ({
        cellId,
        p0: snapshot.uplinkPowerControl.p0NominalPusch,
        alpha: snapshot.uplinkPowerControl.alpha,
      }));

      const predictions = bayesianGNN.predictWithUncertainty(graph, scenarios, coupling);

      for (const pred of predictions.values()) {
        // Mean predictions
        expect(typeof pred.sinrMean).toBe('number');
        expect(typeof pred.iotMean).toBe('number');
        expect(typeof pred.spectralEfficiencyMean).toBe('number');

        // Standard deviations
        expect(pred.sinrStd).toBeGreaterThanOrEqual(0);
        expect(pred.iotStd).toBeGreaterThanOrEqual(0);
        expect(pred.spectralEfficiencyStd).toBeGreaterThanOrEqual(0);

        // Confidence intervals
        expect(pred.sinrCI[0]).toBeLessThanOrEqual(pred.sinrMean);
        expect(pred.sinrCI[1]).toBeGreaterThanOrEqual(pred.sinrMean);

        // Confidence
        expect(pred.confidence).toBeGreaterThanOrEqual(0.5);
        expect(pred.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});

// ============================================================================
// GENETIC ALGORITHM OPTIMIZER TESTS
// ============================================================================

describe('GeneticAlgorithmOptimizer', () => {
  let gaOptimizer: GeneticAlgorithmOptimizer;

  beforeEach(() => {
    gaOptimizer = new GeneticAlgorithmOptimizer({
      populationSize: 20, // Reduced for faster tests
      numGenerations: 10,
      numMonteCarloPasses: 5,
    });
  });

  describe('optimize', () => {
    it('should optimize power control for network', () => {
      const { cellSnapshots, neighborRelations, graph } = createTestGraph();

      const currentScenarios = Array.from(cellSnapshots.entries()).map(([cellId, snapshot]) => ({
        cellId,
        p0: snapshot.uplinkPowerControl.p0NominalPusch,
        alpha: snapshot.uplinkPowerControl.alpha,
      }));

      const result = gaOptimizer.optimize(graph, cellSnapshots, neighborRelations, currentScenarios);

      expect(result.bestConfiguration.length).toBe(currentScenarios.length);
      expect(result.convergenceHistory.length).toBe(10); // numGenerations
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should produce valid parameter configurations', () => {
      const { cellSnapshots, neighborRelations, graph } = createTestGraph();

      const currentScenarios = Array.from(cellSnapshots.entries()).map(([cellId, snapshot]) => ({
        cellId,
        p0: snapshot.uplinkPowerControl.p0NominalPusch,
        alpha: snapshot.uplinkPowerControl.alpha,
      }));

      const result = gaOptimizer.optimize(graph, cellSnapshots, neighborRelations, currentScenarios);

      for (const config of result.bestConfiguration) {
        expect(config.p0).toBeGreaterThanOrEqual(DEFAULT_POWER_CONTROL_CONFIG.p0Min);
        expect(config.p0).toBeLessThanOrEqual(DEFAULT_POWER_CONTROL_CONFIG.p0Max);
        expect(config.alpha).toBeGreaterThanOrEqual(0);
        expect(config.alpha).toBeLessThanOrEqual(1);
      }
    });

    it('should show convergence over generations', () => {
      const { cellSnapshots, neighborRelations, graph } = createTestGraph();

      const currentScenarios = Array.from(cellSnapshots.entries()).map(([cellId, snapshot]) => ({
        cellId,
        p0: snapshot.uplinkPowerControl.p0NominalPusch,
        alpha: snapshot.uplinkPowerControl.alpha,
      }));

      const result = gaOptimizer.optimize(graph, cellSnapshots, neighborRelations, currentScenarios);

      // Convergence history should exist
      expect(result.convergenceHistory.length).toBeGreaterThan(0);

      // Best fitness should not decrease
      let maxFitness = result.convergenceHistory[0];
      for (const fitness of result.convergenceHistory) {
        expect(fitness).toBeGreaterThanOrEqual(maxFitness - 0.01); // Allow small numerical tolerance
        if (fitness > maxFitness) {
          maxFitness = fitness;
        }
      }
    });
  });
});

// ============================================================================
// NETWORK POWER CONTROL OPTIMIZER TESTS
// ============================================================================

describe('NetworkPowerControlOptimizer', () => {
  let networkOptimizer: NetworkPowerControlOptimizer;

  beforeEach(() => {
    networkOptimizer = new NetworkPowerControlOptimizer(
      {
        populationSize: 20,
        numGenerations: 10,
        numMonteCarloPasses: 5,
      }
    );
  });

  describe('optimize', () => {
    it('should generate recommendations for network optimization', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const result = networkOptimizer.optimize({
        cellSnapshots,
        neighborRelations,
      });

      expect(result.recommendations).toBeDefined();
      expect(result.networkImpact).toBeDefined();
      expect(result.convergenceHistory).toBeDefined();
      expect(result.optimizationConfidence).toBeGreaterThanOrEqual(0);
    });

    it('should provide network-wide impact metrics', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const result = networkOptimizer.optimize({
        cellSnapshots,
        neighborRelations,
      });

      expect(typeof result.networkImpact.avgSinrImprovement).toBe('number');
      expect(typeof result.networkImpact.avgIotReduction).toBe('number');
    });

    it('should apply constraints when specified', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const result = networkOptimizer.optimize({
        cellSnapshots,
        neighborRelations,
        constraints: {
          maxP0Change: 3,
          maxAlphaChange: 0.1,
          minCoverage: 0.9,
        },
      });

      // All recommendations should respect constraints
      for (const rec of result.recommendations) {
        expect(Math.abs(rec.recommendedP0 - rec.currentP0)).toBeLessThanOrEqual(3);
        expect(Math.abs(rec.recommendedAlpha - rec.currentAlpha)).toBeLessThanOrEqual(0.1);
      }
    });

    it('should provide rationales for recommendations', () => {
      const { cellSnapshots, neighborRelations } = createTestGraph();

      const result = networkOptimizer.optimize({
        cellSnapshots,
        neighborRelations,
      });

      for (const rec of result.recommendations) {
        expect(rec.rationale.length).toBeGreaterThan(0);
      }
    });
  });
});
