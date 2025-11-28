/**
 * Bayesian GNN-Based Network Optimizer
 *
 * Implements Ericsson's Bayesian Graph Neural Network approach for
 * uplink power control optimization with uncertainty quantification.
 *
 * Key Features:
 * - Monte Carlo Dropout for Bayesian uncertainty estimation
 * - Confidence intervals for predictions
 * - Genetic Algorithm for network-wide P0/Alpha optimization
 * - Multi-objective optimization (SINR vs Interference tradeoff)
 */

import * as ss from 'simple-statistics';
import type {
  CellGraph,
  CellKPISnapshot,
  NeighborRelation,
} from '../models/ran-kpi.js';
import {
  GNNSINRPredictor,
  InterferenceCouplingBuilder,
  type InterferenceCouplingMatrix,
  type PowerControlScenario,
  type SINRPrediction,
} from './sinr-predictor.js';
import { DEFAULT_POWER_CONTROL_CONFIG, type PowerControlConfig } from './uplink-power-control.js';

// ============================================================================
// BAYESIAN GNN CONFIGURATION
// ============================================================================

export interface BayesianGNNConfig {
  // Monte Carlo Dropout
  numMonteCarloPasses: number;
  dropoutRate: number;

  // Confidence Intervals
  confidenceLevel: number; // e.g., 0.95 for 95% CI
  minSamplesForCI: number;

  // Optimization
  populationSize: number;
  numGenerations: number;
  mutationRate: number;
  crossoverRate: number;
  eliteRatio: number;

  // Multi-objective weights
  sinrWeight: number;
  interferenceWeight: number;
  coverageWeight: number;
  fairnessWeight: number;
}

export const DEFAULT_BAYESIAN_CONFIG: BayesianGNNConfig = {
  numMonteCarloPasses: 30,
  dropoutRate: 0.1,

  confidenceLevel: 0.95,
  minSamplesForCI: 10,

  populationSize: 100,
  numGenerations: 50,
  mutationRate: 0.15,
  crossoverRate: 0.7,
  eliteRatio: 0.1,

  sinrWeight: 0.4,
  interferenceWeight: 0.3,
  coverageWeight: 0.2,
  fairnessWeight: 0.1,
};

// ============================================================================
// BAYESIAN PREDICTION WITH CONFIDENCE INTERVALS
// ============================================================================

export interface BayesianPrediction {
  cellId: string;

  // Point estimates
  sinrMean: number;
  iotMean: number;
  spectralEfficiencyMean: number;

  // Uncertainty estimates
  sinrStd: number;
  iotStd: number;
  spectralEfficiencyStd: number;

  // Confidence intervals
  sinrCI: [number, number];
  iotCI: [number, number];
  spectralEfficiencyCI: [number, number];

  // Overall confidence
  confidence: number;
}

export class BayesianGNN {
  private config: BayesianGNNConfig;
  private sinrPredictor: GNNSINRPredictor;

  constructor(config: Partial<BayesianGNNConfig> = {}) {
    this.config = { ...DEFAULT_BAYESIAN_CONFIG, ...config };
    this.sinrPredictor = new GNNSINRPredictor();
  }

  /**
   * Predict with uncertainty using Monte Carlo Dropout
   */
  predictWithUncertainty(
    graph: CellGraph,
    scenarios: PowerControlScenario[],
    coupling: InterferenceCouplingMatrix
  ): Map<string, BayesianPrediction> {
    // Collect predictions from multiple forward passes with dropout
    const allPredictions: Map<string, SINRPrediction[]> = new Map();

    for (let pass = 0; pass < this.config.numMonteCarloPasses; pass++) {
      // Apply dropout to create prediction variability
      const noisyScenarios = this.applyDropoutNoise(scenarios, pass);

      const predictions = this.sinrPredictor.predict(graph, noisyScenarios, coupling);

      for (const [cellId, pred] of predictions) {
        if (!allPredictions.has(cellId)) {
          allPredictions.set(cellId, []);
        }
        allPredictions.get(cellId)!.push(pred);
      }
    }

    // Compute Bayesian statistics
    const bayesianPredictions = new Map<string, BayesianPrediction>();

    for (const [cellId, predictions] of allPredictions) {
      if (predictions.length < this.config.minSamplesForCI) continue;

      const sinrValues = predictions.map(p => p.predictedSinr);
      const iotValues = predictions.map(p => p.predictedIoT);
      const seValues = predictions.map(p => p.predictedSpectralEfficiency);

      const sinrMean = ss.mean(sinrValues);
      const iotMean = ss.mean(iotValues);
      const seMean = ss.mean(seValues);

      const sinrStd = ss.standardDeviation(sinrValues);
      const iotStd = ss.standardDeviation(iotValues);
      const seStd = ss.standardDeviation(seValues);

      // Calculate confidence intervals
      const zScore = this.getZScore(this.config.confidenceLevel);

      bayesianPredictions.set(cellId, {
        cellId,
        sinrMean,
        iotMean,
        spectralEfficiencyMean: seMean,
        sinrStd,
        iotStd,
        spectralEfficiencyStd: seStd,
        sinrCI: [sinrMean - zScore * sinrStd, sinrMean + zScore * sinrStd],
        iotCI: [iotMean - zScore * iotStd, iotMean + zScore * iotStd],
        spectralEfficiencyCI: [seMean - zScore * seStd, seMean + zScore * seStd],
        confidence: this.calculateOverallConfidence(sinrStd, iotStd, seStd),
      });
    }

    return bayesianPredictions;
  }

  /**
   * Apply dropout-style noise to scenarios for Monte Carlo estimation
   */
  private applyDropoutNoise(
    scenarios: PowerControlScenario[],
    seed: number
  ): PowerControlScenario[] {
    // Deterministic pseudo-random based on seed
    const random = (idx: number): number => {
      const x = Math.sin(seed * 12.9898 + idx * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };

    return scenarios.map((scenario, idx) => {
      const shouldDropout = random(idx) < this.config.dropoutRate;

      if (shouldDropout) {
        // Add small noise to parameters
        const noiseP0 = (random(idx + 1000) - 0.5) * 2; // ±1 dB
        const noiseAlpha = (random(idx + 2000) - 0.5) * 0.1; // ±0.05

        return {
          ...scenario,
          p0: scenario.p0 + noiseP0,
          alpha: Math.max(0, Math.min(1, scenario.alpha + noiseAlpha)),
        };
      }

      return scenario;
    });
  }

  /**
   * Get z-score for confidence level
   */
  private getZScore(confidenceLevel: number): number {
    // Common z-scores for confidence intervals
    const zScores: Record<number, number> = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576,
    };

    return zScores[confidenceLevel] || 1.96;
  }

  /**
   * Calculate overall prediction confidence
   */
  private calculateOverallConfidence(sinrStd: number, iotStd: number, seStd: number): number {
    // Normalize standard deviations to expected ranges
    const sinrNormalizedStd = sinrStd / 5; // Expected range: ~5 dB
    const iotNormalizedStd = iotStd / 3; // Expected range: ~3 dB
    const seNormalizedStd = seStd / 1; // Expected range: ~1 bps/Hz

    const avgNormalizedStd = (sinrNormalizedStd + iotNormalizedStd + seNormalizedStd) / 3;

    // Convert to confidence (inverse relationship)
    return Math.max(0.5, Math.min(0.99, 1 / (1 + avgNormalizedStd)));
  }

  /**
   * Get underlying SINR predictor
   */
  getSINRPredictor(): GNNSINRPredictor {
    return this.sinrPredictor;
  }
}

// ============================================================================
// GENETIC ALGORITHM OPTIMIZER
// ============================================================================

export interface Individual {
  genes: PowerControlScenario[];
  fitness: number;
  objectives: {
    avgSinr: number;
    avgIoT: number;
    coverage: number;
    fairness: number;
  };
}

export interface OptimizationResult {
  bestConfiguration: PowerControlScenario[];
  improvements: Map<string, {
    sinrImprovement: number;
    iotReduction: number;
    p0Change: number;
    alphaChange: number;
  }>;
  convergenceHistory: number[];
  paretoFront: Individual[];
  totalIterations: number;
  confidence: number;
}

export class GeneticAlgorithmOptimizer {
  private config: BayesianGNNConfig;
  private powerControlConfig: PowerControlConfig;
  private bayesianGNN: BayesianGNN;
  private couplingBuilder: InterferenceCouplingBuilder;

  constructor(
    config: Partial<BayesianGNNConfig> = {},
    powerControlConfig: Partial<PowerControlConfig> = {}
  ) {
    this.config = { ...DEFAULT_BAYESIAN_CONFIG, ...config };
    this.powerControlConfig = { ...DEFAULT_POWER_CONTROL_CONFIG, ...powerControlConfig };
    this.bayesianGNN = new BayesianGNN(config);
    this.couplingBuilder = new InterferenceCouplingBuilder();
  }

  /**
   * Optimize network-wide power control using genetic algorithm
   */
  optimize(
    graph: CellGraph,
    cellSnapshots: Map<string, CellKPISnapshot>,
    neighborRelations: NeighborRelation[],
    currentScenarios: PowerControlScenario[]
  ): OptimizationResult {
    // Build interference coupling matrix
    const coupling = this.couplingBuilder.buildCouplingMatrix(cellSnapshots, neighborRelations);

    // Initialize population
    let population = this.initializePopulation(currentScenarios);

    // Evaluate initial population
    population = this.evaluatePopulation(population, graph, coupling);

    const convergenceHistory: number[] = [];
    const paretoFront: Individual[] = [];

    // Evolution loop
    for (let gen = 0; gen < this.config.numGenerations; gen++) {
      // Selection
      const parents = this.selection(population);

      // Crossover
      const offspring = this.crossover(parents);

      // Mutation
      const mutatedOffspring = this.mutation(offspring);

      // Evaluate offspring
      const evaluatedOffspring = this.evaluatePopulation(mutatedOffspring, graph, coupling);

      // Survivor selection (elitism + best offspring)
      population = this.survivorSelection(population, evaluatedOffspring);

      // Track convergence
      const bestFitness = Math.max(...population.map(ind => ind.fitness));
      convergenceHistory.push(bestFitness);

      // Update Pareto front
      this.updateParetoFront(paretoFront, population);
    }

    // Select best individual
    const best = this.selectBest(population);

    // Calculate improvements from current configuration
    const improvements = this.calculateImprovements(
      currentScenarios,
      best.genes,
      graph,
      coupling
    );

    // Calculate overall confidence from Bayesian predictions
    const confidence = this.calculateOptimizationConfidence(best, graph, coupling);

    return {
      bestConfiguration: best.genes,
      improvements,
      convergenceHistory,
      paretoFront,
      totalIterations: this.config.numGenerations * this.config.populationSize,
      confidence,
    };
  }

  /**
   * Initialize population with variations around current configuration
   */
  private initializePopulation(currentScenarios: PowerControlScenario[]): Individual[] {
    const population: Individual[] = [];

    // Add current configuration
    population.push({
      genes: [...currentScenarios],
      fitness: 0,
      objectives: { avgSinr: 0, avgIoT: 0, coverage: 0, fairness: 0 },
    });

    // Generate random variations
    for (let i = 1; i < this.config.populationSize; i++) {
      const genes = currentScenarios.map(scenario => ({
        cellId: scenario.cellId,
        p0: this.mutateP0(scenario.p0, 0.3), // 30% mutation strength for initialization
        alpha: this.mutateAlpha(scenario.alpha, 0.3),
      }));

      population.push({
        genes,
        fitness: 0,
        objectives: { avgSinr: 0, avgIoT: 0, coverage: 0, fairness: 0 },
      });
    }

    return population;
  }

  /**
   * Evaluate fitness of population
   */
  private evaluatePopulation(
    population: Individual[],
    graph: CellGraph,
    coupling: InterferenceCouplingMatrix
  ): Individual[] {
    return population.map(individual => {
      const predictions = this.bayesianGNN.predictWithUncertainty(
        graph,
        individual.genes,
        coupling
      );

      const objectives = this.calculateObjectives(predictions, individual.genes);
      const fitness = this.calculateFitness(objectives);

      return {
        ...individual,
        fitness,
        objectives,
      };
    });
  }

  /**
   * Calculate multi-objective scores
   */
  private calculateObjectives(
    predictions: Map<string, BayesianPrediction>,
    scenarios: PowerControlScenario[]
  ): Individual['objectives'] {
    const sinrValues: number[] = [];
    const iotValues: number[] = [];

    for (const pred of predictions.values()) {
      sinrValues.push(pred.sinrMean);
      iotValues.push(pred.iotMean);
    }

    if (sinrValues.length === 0) {
      return { avgSinr: 0, avgIoT: 20, coverage: 0, fairness: 0 };
    }

    const avgSinr = ss.mean(sinrValues);
    const avgIoT = ss.mean(iotValues);

    // Coverage: percentage of cells with SINR > threshold
    const sinrThreshold = 5; // dB
    const coverage = sinrValues.filter(s => s > sinrThreshold).length / sinrValues.length;

    // Fairness: Jain's fairness index
    const sinrSum = sinrValues.reduce((a, b) => a + b, 0);
    const sinrSumSquares = sinrValues.reduce((a, b) => a + b * b, 0);
    const fairness = sinrValues.length > 0
      ? (sinrSum * sinrSum) / (sinrValues.length * sinrSumSquares)
      : 0;

    return { avgSinr, avgIoT, coverage, fairness };
  }

  /**
   * Calculate weighted fitness score
   */
  private calculateFitness(objectives: Individual['objectives']): number {
    // Normalize objectives to [0, 1] range
    const normalizedSinr = Math.max(0, Math.min(1, (objectives.avgSinr + 5) / 35)); // -5 to 30 dB
    const normalizedIoT = Math.max(0, Math.min(1, 1 - objectives.avgIoT / 20)); // 0 to 20 dB (inverted)
    const normalizedCoverage = objectives.coverage;
    const normalizedFairness = objectives.fairness;

    return (
      this.config.sinrWeight * normalizedSinr +
      this.config.interferenceWeight * normalizedIoT +
      this.config.coverageWeight * normalizedCoverage +
      this.config.fairnessWeight * normalizedFairness
    );
  }

  /**
   * Tournament selection
   */
  private selection(population: Individual[]): Individual[] {
    const selected: Individual[] = [];
    const tournamentSize = 3;

    for (let i = 0; i < population.length; i++) {
      // Select random tournament participants
      const tournament: Individual[] = [];
      for (let j = 0; j < tournamentSize; j++) {
        const idx = Math.floor(Math.random() * population.length);
        tournament.push(population[idx]);
      }

      // Select best from tournament
      const winner = tournament.reduce((best, current) =>
        current.fitness > best.fitness ? current : best
      );

      selected.push(winner);
    }

    return selected;
  }

  /**
   * Uniform crossover
   */
  private crossover(parents: Individual[]): Individual[] {
    const offspring: Individual[] = [];

    for (let i = 0; i < parents.length - 1; i += 2) {
      if (Math.random() < this.config.crossoverRate) {
        const parent1 = parents[i];
        const parent2 = parents[i + 1];

        // Create two offspring by mixing genes
        const child1Genes = parent1.genes.map((gene, idx) => ({
          cellId: gene.cellId,
          p0: Math.random() < 0.5 ? gene.p0 : parent2.genes[idx].p0,
          alpha: Math.random() < 0.5 ? gene.alpha : parent2.genes[idx].alpha,
        }));

        const child2Genes = parent1.genes.map((gene, idx) => ({
          cellId: gene.cellId,
          p0: Math.random() < 0.5 ? parent2.genes[idx].p0 : gene.p0,
          alpha: Math.random() < 0.5 ? parent2.genes[idx].alpha : gene.alpha,
        }));

        offspring.push({
          genes: child1Genes,
          fitness: 0,
          objectives: { avgSinr: 0, avgIoT: 0, coverage: 0, fairness: 0 },
        });

        offspring.push({
          genes: child2Genes,
          fitness: 0,
          objectives: { avgSinr: 0, avgIoT: 0, coverage: 0, fairness: 0 },
        });
      } else {
        // No crossover - copy parents
        offspring.push({ ...parents[i], fitness: 0 });
        offspring.push({ ...parents[i + 1], fitness: 0 });
      }
    }

    return offspring;
  }

  /**
   * Mutation operator
   */
  private mutation(population: Individual[]): Individual[] {
    return population.map(individual => {
      const mutatedGenes = individual.genes.map(gene => {
        if (Math.random() < this.config.mutationRate) {
          return {
            cellId: gene.cellId,
            p0: this.mutateP0(gene.p0, 0.1),
            alpha: this.mutateAlpha(gene.alpha, 0.1),
          };
        }
        return gene;
      });

      return {
        ...individual,
        genes: mutatedGenes,
      };
    });
  }

  /**
   * Mutate P0 value within constraints
   */
  private mutateP0(p0: number, strength: number): number {
    const delta = (Math.random() - 0.5) * 2 * 10 * strength; // ±10 dB * strength
    const newP0 = Math.round(p0 + delta);
    return Math.max(this.powerControlConfig.p0Min, Math.min(this.powerControlConfig.p0Max, newP0));
  }

  /**
   * Mutate alpha value within constraints
   */
  private mutateAlpha(alpha: number, strength: number): number {
    const delta = (Math.random() - 0.5) * 2 * 0.3 * strength; // ±0.3 * strength
    const newAlpha = alpha + delta;

    // Find nearest valid alpha value
    const validAlphas = this.powerControlConfig.alphaValues;
    return validAlphas.reduce((best, current) =>
      Math.abs(current - newAlpha) < Math.abs(best - newAlpha) ? current : best
    );
  }

  /**
   * Survivor selection with elitism
   */
  private survivorSelection(
    parents: Individual[],
    offspring: Individual[]
  ): Individual[] {
    const combined = [...parents, ...offspring];
    combined.sort((a, b) => b.fitness - a.fitness);

    const eliteCount = Math.floor(this.config.populationSize * this.config.eliteRatio);
    const survivors = combined.slice(0, this.config.populationSize);

    return survivors;
  }

  /**
   * Update Pareto front with non-dominated solutions
   */
  private updateParetoFront(paretoFront: Individual[], population: Individual[]): void {
    for (const individual of population) {
      let dominated = false;
      const toRemove: number[] = [];

      for (let i = 0; i < paretoFront.length; i++) {
        if (this.dominates(paretoFront[i].objectives, individual.objectives)) {
          dominated = true;
          break;
        }
        if (this.dominates(individual.objectives, paretoFront[i].objectives)) {
          toRemove.push(i);
        }
      }

      if (!dominated) {
        // Remove dominated solutions from Pareto front
        for (let i = toRemove.length - 1; i >= 0; i--) {
          paretoFront.splice(toRemove[i], 1);
        }
        paretoFront.push(individual);
      }
    }
  }

  /**
   * Check if objectives1 dominates objectives2
   */
  private dominates(
    obj1: Individual['objectives'],
    obj2: Individual['objectives']
  ): boolean {
    // obj1 dominates obj2 if it's better in all objectives and strictly better in at least one
    const better1 = obj1.avgSinr >= obj2.avgSinr &&
      obj1.avgIoT <= obj2.avgIoT &&
      obj1.coverage >= obj2.coverage &&
      obj1.fairness >= obj2.fairness;

    const strictlyBetter = obj1.avgSinr > obj2.avgSinr ||
      obj1.avgIoT < obj2.avgIoT ||
      obj1.coverage > obj2.coverage ||
      obj1.fairness > obj2.fairness;

    return better1 && strictlyBetter;
  }

  /**
   * Select best individual from population
   */
  private selectBest(population: Individual[]): Individual {
    return population.reduce((best, current) =>
      current.fitness > best.fitness ? current : best
    );
  }

  /**
   * Calculate improvements from optimization
   */
  private calculateImprovements(
    current: PowerControlScenario[],
    optimized: PowerControlScenario[],
    graph: CellGraph,
    coupling: InterferenceCouplingMatrix
  ): Map<string, { sinrImprovement: number; iotReduction: number; p0Change: number; alphaChange: number }> {
    const improvements = new Map();

    const currentPredictions = this.bayesianGNN.predictWithUncertainty(graph, current, coupling);
    const optimizedPredictions = this.bayesianGNN.predictWithUncertainty(graph, optimized, coupling);

    const currentMap = new Map(current.map(s => [s.cellId, s]));
    const optimizedMap = new Map(optimized.map(s => [s.cellId, s]));

    for (const [cellId, optPred] of optimizedPredictions) {
      const curPred = currentPredictions.get(cellId);
      const curScenario = currentMap.get(cellId);
      const optScenario = optimizedMap.get(cellId);

      if (!curPred || !curScenario || !optScenario) continue;

      improvements.set(cellId, {
        sinrImprovement: optPred.sinrMean - curPred.sinrMean,
        iotReduction: curPred.iotMean - optPred.iotMean,
        p0Change: optScenario.p0 - curScenario.p0,
        alphaChange: optScenario.alpha - curScenario.alpha,
      });
    }

    return improvements;
  }

  /**
   * Calculate optimization confidence based on Bayesian predictions
   */
  private calculateOptimizationConfidence(
    best: Individual,
    graph: CellGraph,
    coupling: InterferenceCouplingMatrix
  ): number {
    const predictions = this.bayesianGNN.predictWithUncertainty(graph, best.genes, coupling);

    const confidences: number[] = [];
    for (const pred of predictions.values()) {
      confidences.push(pred.confidence);
    }

    return confidences.length > 0 ? ss.mean(confidences) : 0.5;
  }

  /**
   * Get Bayesian GNN for direct predictions
   */
  getBayesianGNN(): BayesianGNN {
    return this.bayesianGNN;
  }
}

// ============================================================================
// NETWORK-WIDE OPTIMIZER (MAIN ENTRY POINT)
// ============================================================================

export interface NetworkOptimizationRequest {
  cellSnapshots: Map<string, CellKPISnapshot>;
  neighborRelations: NeighborRelation[];
  targetCells?: string[]; // Optional: only optimize specific cells
  constraints?: {
    maxP0Change: number;
    maxAlphaChange: number;
    minCoverage: number;
  };
}

export interface NetworkOptimizationResult {
  recommendations: Array<{
    cellId: string;
    currentP0: number;
    currentAlpha: number;
    recommendedP0: number;
    recommendedAlpha: number;
    expectedSinrImprovement: number;
    expectedIotReduction: number;
    confidenceInterval: [number, number];
    confidence: number;
    rationale: string;
  }>;
  networkImpact: {
    avgSinrImprovement: number;
    avgIotReduction: number;
    coverageChange: number;
    fairnessChange: number;
  };
  convergenceHistory: number[];
  optimizationConfidence: number;
}

export class NetworkPowerControlOptimizer {
  private gaOptimizer: GeneticAlgorithmOptimizer;
  private couplingBuilder: InterferenceCouplingBuilder;

  constructor(
    bayesianConfig: Partial<BayesianGNNConfig> = {},
    powerControlConfig: Partial<PowerControlConfig> = {}
  ) {
    this.gaOptimizer = new GeneticAlgorithmOptimizer(bayesianConfig, powerControlConfig);
    this.couplingBuilder = new InterferenceCouplingBuilder();
  }

  /**
   * Optimize network-wide power control
   */
  optimize(request: NetworkOptimizationRequest): NetworkOptimizationResult {
    const { cellSnapshots, neighborRelations, targetCells, constraints } = request;

    // Build cell graph
    const graph = this.buildGraph(cellSnapshots, neighborRelations);

    // Extract current power control scenarios
    const currentScenarios: PowerControlScenario[] = [];
    for (const [cellId, snapshot] of cellSnapshots) {
      if (targetCells && !targetCells.includes(cellId)) continue;

      currentScenarios.push({
        cellId,
        p0: snapshot.uplinkPowerControl.p0NominalPusch,
        alpha: snapshot.uplinkPowerControl.alpha,
      });
    }

    // Run genetic algorithm optimization
    const gaResult = this.gaOptimizer.optimize(
      graph,
      cellSnapshots,
      neighborRelations,
      currentScenarios
    );

    // Apply constraints if specified
    const constrainedConfig = constraints
      ? this.applyConstraints(currentScenarios, gaResult.bestConfiguration, constraints)
      : gaResult.bestConfiguration;

    // Build detailed recommendations
    const recommendations = this.buildRecommendations(
      cellSnapshots,
      currentScenarios,
      constrainedConfig,
      gaResult.improvements
    );

    // Calculate network-wide impact
    const networkImpact = this.calculateNetworkImpact(gaResult.improvements);

    return {
      recommendations,
      networkImpact,
      convergenceHistory: gaResult.convergenceHistory,
      optimizationConfidence: gaResult.confidence,
    };
  }

  /**
   * Build cell graph from snapshots and relations
   */
  private buildGraph(
    cellSnapshots: Map<string, CellKPISnapshot>,
    neighborRelations: NeighborRelation[]
  ): CellGraph {
    const nodes = Array.from(cellSnapshots.entries()).map(([cellId, snapshot]) => ({
      id: cellId,
      cellId,
      features: this.extractFeatures(snapshot),
      position: snapshot.cell.latitude && snapshot.cell.longitude
        ? [snapshot.cell.latitude, snapshot.cell.longitude] as [number, number]
        : undefined,
    }));

    const edges = neighborRelations
      .filter(rel =>
        cellSnapshots.has(rel.sourceCellId) && cellSnapshots.has(rel.targetCellId)
      )
      .map(rel => ({
        source: rel.sourceCellId,
        target: rel.targetCellId,
        relationshipType: rel.relationshipType,
        features: [
          rel.sourceSinr / 30,
          rel.targetSinr / 30,
          (rel.targetSinr - rel.sourceSinr) / 20,
          (rel.sourceRsrp + 140) / 60,
          (rel.targetRsrp + 140) / 60,
          rel.hoSuccessRate / 100,
        ],
        weight: rel.hoSuccessRate / 100,
      }));

    return {
      nodes,
      edges,
      metadata: {
        timestamp: new Date(),
        numCells: nodes.length,
        numRelations: edges.length,
      },
    };
  }

  /**
   * Extract feature vector from cell snapshot
   */
  private extractFeatures(snapshot: CellKPISnapshot): number[] {
    const pc = snapshot.uplinkPowerControl;
    const ui = snapshot.uplinkInterference;
    const rq = snapshot.radioQuality;

    return [
      // Power control features
      (pc.p0NominalPusch + 110) / 25, // Normalized P0
      pc.alpha, // Alpha
      pc.powerHeadroomAvg / 40, // Normalized PHR
      pc.powerLimitedUeRatio / 100,
      (pc.pathLossAvg - 80) / 60, // Normalized path loss

      // Interference features
      ui.iotAvg / 20,
      ui.highInterferencePrbRatio / 100,
      ui.rip / -100,

      // Radio quality features
      (rq.ulSinrAvg + 5) / 35,
      rq.rsrpAvg / -140,
      rq.ulSpectralEfficiency / 6,

      // TPC features
      pc.tpcUpCommands / (pc.tpcUpCommands + pc.tpcDownCommands + 1),
      pc.negativePowerHeadroomRatio / 100,
    ];
  }

  /**
   * Apply constraints to optimized configuration
   */
  private applyConstraints(
    current: PowerControlScenario[],
    optimized: PowerControlScenario[],
    constraints: NonNullable<NetworkOptimizationRequest['constraints']>
  ): PowerControlScenario[] {
    const currentMap = new Map(current.map(s => [s.cellId, s]));

    return optimized.map(opt => {
      const cur = currentMap.get(opt.cellId);
      if (!cur) return opt;

      let p0 = opt.p0;
      let alpha = opt.alpha;

      // Limit P0 change
      const p0Change = p0 - cur.p0;
      if (Math.abs(p0Change) > constraints.maxP0Change) {
        p0 = cur.p0 + Math.sign(p0Change) * constraints.maxP0Change;
      }

      // Limit alpha change
      const alphaChange = alpha - cur.alpha;
      if (Math.abs(alphaChange) > constraints.maxAlphaChange) {
        alpha = cur.alpha + Math.sign(alphaChange) * constraints.maxAlphaChange;
      }

      return { cellId: opt.cellId, p0, alpha };
    });
  }

  /**
   * Build detailed recommendations
   */
  private buildRecommendations(
    cellSnapshots: Map<string, CellKPISnapshot>,
    currentScenarios: PowerControlScenario[],
    optimizedScenarios: PowerControlScenario[],
    improvements: Map<string, { sinrImprovement: number; iotReduction: number; p0Change: number; alphaChange: number }>
  ): NetworkOptimizationResult['recommendations'] {
    const currentMap = new Map(currentScenarios.map(s => [s.cellId, s]));
    const optimizedMap = new Map(optimizedScenarios.map(s => [s.cellId, s]));

    const recommendations: NetworkOptimizationResult['recommendations'] = [];

    for (const [cellId, improvement] of improvements) {
      const cur = currentMap.get(cellId);
      const opt = optimizedMap.get(cellId);
      const snapshot = cellSnapshots.get(cellId);

      if (!cur || !opt || !snapshot) continue;

      // Only include if there's a meaningful change
      if (Math.abs(improvement.p0Change) < 1 && Math.abs(improvement.alphaChange) < 0.05) {
        continue;
      }

      const rationale = this.generateRationale(snapshot, improvement);

      recommendations.push({
        cellId,
        currentP0: cur.p0,
        currentAlpha: cur.alpha,
        recommendedP0: opt.p0,
        recommendedAlpha: opt.alpha,
        expectedSinrImprovement: improvement.sinrImprovement,
        expectedIotReduction: improvement.iotReduction,
        confidenceInterval: [
          improvement.sinrImprovement - 1.5,
          improvement.sinrImprovement + 1.5,
        ],
        confidence: Math.max(0.6, 0.9 - Math.abs(improvement.p0Change) * 0.02),
        rationale,
      });
    }

    // Sort by expected improvement
    recommendations.sort((a, b) => b.expectedSinrImprovement - a.expectedSinrImprovement);

    return recommendations;
  }

  /**
   * Generate human-readable rationale for recommendation
   */
  private generateRationale(
    snapshot: CellKPISnapshot,
    improvement: { sinrImprovement: number; iotReduction: number; p0Change: number; alphaChange: number }
  ): string {
    const parts: string[] = [];

    if (improvement.p0Change > 0) {
      parts.push(`Increase P0 by ${improvement.p0Change.toFixed(0)} dB to improve cell-edge SINR`);
    } else if (improvement.p0Change < 0) {
      parts.push(`Decrease P0 by ${Math.abs(improvement.p0Change).toFixed(0)} dB to reduce neighbor interference`);
    }

    if (improvement.alphaChange > 0.05) {
      parts.push(`Increase alpha to better compensate path loss for cell-edge users`);
    } else if (improvement.alphaChange < -0.05) {
      parts.push(`Decrease alpha to reduce interference from cell-edge users`);
    }

    if (snapshot.uplinkInterference.iotAvg > 8) {
      parts.push(`Current IoT is high (${snapshot.uplinkInterference.iotAvg.toFixed(1)} dB)`);
    }

    if (snapshot.uplinkPowerControl.powerLimitedUeRatio > 15) {
      parts.push(`${snapshot.uplinkPowerControl.powerLimitedUeRatio.toFixed(0)}% UEs are power-limited`);
    }

    return parts.length > 0 ? parts.join('. ') : 'Minor adjustment for network-wide optimization';
  }

  /**
   * Calculate network-wide impact
   */
  private calculateNetworkImpact(
    improvements: Map<string, { sinrImprovement: number; iotReduction: number; p0Change: number; alphaChange: number }>
  ): NetworkOptimizationResult['networkImpact'] {
    const sinrImprovements: number[] = [];
    const iotReductions: number[] = [];

    for (const imp of improvements.values()) {
      sinrImprovements.push(imp.sinrImprovement);
      iotReductions.push(imp.iotReduction);
    }

    return {
      avgSinrImprovement: sinrImprovements.length > 0 ? ss.mean(sinrImprovements) : 0,
      avgIotReduction: iotReductions.length > 0 ? ss.mean(iotReductions) : 0,
      coverageChange: 0, // Would need before/after prediction
      fairnessChange: 0,
    };
  }
}

export default {
  BayesianGNN,
  GeneticAlgorithmOptimizer,
  NetworkPowerControlOptimizer,
  DEFAULT_BAYESIAN_CONFIG,
};
