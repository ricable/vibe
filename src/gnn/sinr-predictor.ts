/**
 * GNN-Based SINR Predictor for Uplink Power Control
 *
 * Implements the Ericsson GNN approach for predicting SINR outcomes
 * based on P0/Alpha parameter settings and network topology.
 *
 * Key Features:
 * - Multi-layer GNN with attention mechanism for neighbor awareness
 * - SINR prediction from power control parameters
 * - Interference coupling modeling
 * - Performance indicator prediction (SINR, Spectral Efficiency)
 */

import * as ss from 'simple-statistics';
import type {
  CellGraph,
  CellKPISnapshot,
  NeighborRelation,
} from '../models/ran-kpi.js';

// ============================================================================
// SINR PREDICTOR CONFIGURATION
// ============================================================================

export interface SINRPredictorConfig {
  // GNN Architecture
  inputDim: number;
  hiddenDim: number;
  outputDim: number;
  numLayers: number;
  numHeads: number;
  dropout: number;

  // Physical Layer Parameters
  thermalNoisePower: number; // dBm/Hz
  systemBandwidth: number; // Hz
  noiseFigure: number; // dB
  maxUePower: number; // dBm (Pcmax)

  // Training Parameters
  learningRate: number;
  l2Regularization: number;
}

export const DEFAULT_SINR_PREDICTOR_CONFIG: SINRPredictorConfig = {
  inputDim: 24,
  hiddenDim: 128,
  outputDim: 3, // [SINR, IoT, Spectral Efficiency]
  numLayers: 4,
  numHeads: 8,
  dropout: 0.1,

  thermalNoisePower: -174,
  systemBandwidth: 20e6,
  noiseFigure: 5,
  maxUePower: 23,

  learningRate: 0.001,
  l2Regularization: 0.0001,
};

// ============================================================================
// INTERFERENCE COUPLING MATRIX
// ============================================================================

export interface InterferenceCouplingMatrix {
  cellIds: string[];
  matrix: number[][]; // Coupling factors between cells
  pathLossMatrix: number[][]; // Inter-cell path loss
  timestamp: Date;
}

export class InterferenceCouplingBuilder {
  /**
   * Build interference coupling matrix from neighbor relations and KPIs
   * Models how UE transmissions in one cell affect neighbor cell SINR
   */
  buildCouplingMatrix(
    cellSnapshots: Map<string, CellKPISnapshot>,
    neighborRelations: NeighborRelation[]
  ): InterferenceCouplingMatrix {
    const cellIds = Array.from(cellSnapshots.keys());
    const n = cellIds.length;
    const cellIdToIndex = new Map(cellIds.map((id, idx) => [id, idx]));

    // Initialize matrices
    const couplingMatrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    const pathLossMatrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(Infinity));

    // Self-coupling (diagonal) - represents own cell interference
    for (let i = 0; i < n; i++) {
      couplingMatrix[i][i] = 1.0;
      pathLossMatrix[i][i] = 0;
    }

    // Build coupling from neighbor relations
    for (const relation of neighborRelations) {
      const sourceIdx = cellIdToIndex.get(relation.sourceCellId);
      const targetIdx = cellIdToIndex.get(relation.targetCellId);

      if (sourceIdx === undefined || targetIdx === undefined) continue;

      // Calculate coupling factor based on RSRP/RSRQ difference and distance
      const rsrpDelta = Math.abs(relation.sourceRsrp - relation.targetRsrp);
      const sinrDelta = Math.abs(relation.sourceSinr - relation.targetSinr);

      // Inter-cell path loss approximation
      // Path loss difference indicates how much signal leaks between cells
      const interCellPathLoss = this.estimateInterCellPathLoss(relation);
      pathLossMatrix[sourceIdx][targetIdx] = interCellPathLoss;
      pathLossMatrix[targetIdx][sourceIdx] = interCellPathLoss;

      // Coupling factor: higher when cells are close (low path loss between them)
      // and when they share same frequency (intra-freq = higher coupling)
      let couplingFactor = Math.pow(10, -interCellPathLoss / 20);

      if (relation.relationshipType === 'intra-freq') {
        couplingFactor *= 1.0; // Full coupling for same frequency
      } else if (relation.relationshipType === 'inter-freq') {
        couplingFactor *= 0.1; // 10% coupling for different frequency
      } else {
        couplingFactor *= 0.01; // 1% for inter-RAT
      }

      couplingMatrix[sourceIdx][targetIdx] = couplingFactor;
      couplingMatrix[targetIdx][sourceIdx] = couplingFactor;
    }

    return {
      cellIds,
      matrix: couplingMatrix,
      pathLossMatrix,
      timestamp: new Date(),
    };
  }

  /**
   * Estimate inter-cell path loss from neighbor relation measurements
   */
  private estimateInterCellPathLoss(relation: NeighborRelation): number {
    // Use RSRP measurements to estimate path loss between cells
    // Higher RSRP to neighbor = lower path loss = more interference coupling

    // Base inter-cell path loss (typical for neighbor cells)
    const basePathLoss = 100; // dB

    // Adjust based on target RSRP (relative to source)
    // Target RSRP closer to source RSRP means lower inter-cell path loss
    const rsrpDelta = relation.sourceRsrp - relation.targetRsrp;

    // If distance is available, use it
    if (relation.distance !== undefined) {
      // Log-distance path loss model: PL = PL_0 + 10*n*log10(d/d0)
      const pathLossExponent = 3.5;
      const referenceDistance = 100; // meters
      const referencePathLoss = 80; // dB at 100m

      return referencePathLoss + 10 * pathLossExponent * Math.log10(relation.distance / referenceDistance);
    }

    // Estimate from RSRP difference
    return basePathLoss + rsrpDelta * 0.5;
  }

  /**
   * Calculate expected interference increase from P0 change in a cell
   */
  calculateInterferenceImpact(
    coupling: InterferenceCouplingMatrix,
    sourceCellId: string,
    p0Change: number,
    alphaChange: number,
    avgPathLoss: number
  ): Map<string, number> {
    const impacts = new Map<string, number>();
    const sourceIdx = coupling.cellIds.indexOf(sourceCellId);

    if (sourceIdx === -1) return impacts;

    // Change in UE TX power due to P0/Alpha change
    // Delta_Ptx = Delta_P0 + Delta_alpha * PL
    const txPowerChange = p0Change + alphaChange * avgPathLoss;

    // Propagate interference to neighbors using coupling matrix
    for (let i = 0; i < coupling.cellIds.length; i++) {
      if (i === sourceIdx) continue;

      const coupling_ij = coupling.matrix[sourceIdx][i];
      if (coupling_ij > 0.001) {
        // Interference increase at neighbor = coupling * TX power increase
        const interferenceIncrease = txPowerChange * coupling_ij;
        impacts.set(coupling.cellIds[i], interferenceIncrease);
      }
    }

    return impacts;
  }
}

// ============================================================================
// GNN-BASED SINR PREDICTOR
// ============================================================================

export interface SINRPrediction {
  cellId: string;
  predictedSinr: number;
  predictedIoT: number;
  predictedSpectralEfficiency: number;
  confidence: number;
}

export interface PowerControlScenario {
  cellId: string;
  p0: number;
  alpha: number;
}

/**
 * GNN-based SINR Predictor
 *
 * Uses Graph Neural Network to predict SINR outcomes based on:
 * - Cell features (current KPIs, path loss distribution)
 * - Power control parameters (P0, Alpha)
 * - Neighbor relationships and interference coupling
 */
export class GNNSINRPredictor {
  private config: SINRPredictorConfig;
  private weights: {
    inputProjection: number[][];
    gnnLayers: Array<{
      W_query: number[][];
      W_key: number[][];
      W_value: number[][];
      W_out: number[][];
      W_edge: number[][];
    }>;
    outputProjection: number[][];
  };
  private trained: boolean = false;

  constructor(config: Partial<SINRPredictorConfig> = {}) {
    this.config = { ...DEFAULT_SINR_PREDICTOR_CONFIG, ...config };
    this.weights = this.initializeWeights();
  }

  /**
   * Initialize network weights with Xavier initialization
   */
  private initializeWeights(): typeof this.weights {
    const { inputDim, hiddenDim, outputDim, numLayers, numHeads } = this.config;

    const xavierInit = (fanIn: number, fanOut: number): number[][] => {
      const std = Math.sqrt(2 / (fanIn + fanOut));
      return Array(fanIn).fill(null).map(() =>
        Array(fanOut).fill(null).map(() => (Math.random() * 2 - 1) * std)
      );
    };

    const gnnLayers = [];
    for (let i = 0; i < numLayers; i++) {
      const layerInputDim = i === 0 ? inputDim : hiddenDim;
      gnnLayers.push({
        W_query: xavierInit(layerInputDim, hiddenDim),
        W_key: xavierInit(layerInputDim, hiddenDim),
        W_value: xavierInit(layerInputDim, hiddenDim),
        W_out: xavierInit(hiddenDim, hiddenDim),
        W_edge: xavierInit(16, hiddenDim), // Edge feature dim = 16
      });
    }

    return {
      inputProjection: xavierInit(inputDim, hiddenDim),
      gnnLayers,
      outputProjection: xavierInit(hiddenDim, outputDim),
    };
  }

  /**
   * Predict SINR for given power control scenario
   */
  predict(
    graph: CellGraph,
    scenarios: PowerControlScenario[],
    coupling: InterferenceCouplingMatrix
  ): Map<string, SINRPrediction> {
    // Build feature matrix with scenario P0/Alpha values
    const nodeFeatures = this.buildNodeFeatures(graph, scenarios);

    // Add interference coupling features
    const enhancedFeatures = this.addInterferenceFeatures(nodeFeatures, coupling, graph);

    // Forward pass through GNN
    let hidden = this.matmul(enhancedFeatures, this.weights.inputProjection);

    // Process through GNN layers
    for (const layer of this.weights.gnnLayers) {
      hidden = this.gnnLayerForward(hidden, graph, layer);
    }

    // Output projection to predict [SINR, IoT, Spectral Efficiency]
    const outputs = this.matmul(hidden, this.weights.outputProjection);

    // Build predictions
    const predictions = new Map<string, SINRPrediction>();
    graph.nodes.forEach((node, idx) => {
      const output = outputs[idx];

      // Decode predictions (tanh activation scaled to reasonable ranges)
      const predictedSinr = Math.tanh(output[0]) * 20 + 10; // Range: -10 to 30 dB
      const predictedIoT = Math.tanh(output[1]) * 10 + 5; // Range: -5 to 15 dB
      const predictedSpectralEfficiency = Math.max(0, (Math.tanh(output[2]) + 1) * 3); // Range: 0 to 6 bps/Hz

      // Calculate confidence based on prediction variance
      const confidence = this.calculatePredictionConfidence(hidden[idx]);

      predictions.set(node.cellId, {
        cellId: node.cellId,
        predictedSinr,
        predictedIoT,
        predictedSpectralEfficiency,
        confidence,
      });
    });

    return predictions;
  }

  /**
   * Predict SINR improvement from parameter change
   */
  predictImprovement(
    graph: CellGraph,
    currentScenarios: PowerControlScenario[],
    proposedScenarios: PowerControlScenario[],
    coupling: InterferenceCouplingMatrix
  ): Map<string, { sinrImprovement: number; iotReduction: number; confidence: number }> {
    const currentPredictions = this.predict(graph, currentScenarios, coupling);
    const proposedPredictions = this.predict(graph, proposedScenarios, coupling);

    const improvements = new Map<string, { sinrImprovement: number; iotReduction: number; confidence: number }>();

    for (const [cellId, proposed] of proposedPredictions) {
      const current = currentPredictions.get(cellId);
      if (!current) continue;

      improvements.set(cellId, {
        sinrImprovement: proposed.predictedSinr - current.predictedSinr,
        iotReduction: current.predictedIoT - proposed.predictedIoT,
        confidence: Math.min(current.confidence, proposed.confidence),
      });
    }

    return improvements;
  }

  /**
   * Build node features including power control parameters
   */
  private buildNodeFeatures(
    graph: CellGraph,
    scenarios: PowerControlScenario[]
  ): number[][] {
    const scenarioMap = new Map(scenarios.map(s => [s.cellId, s]));

    return graph.nodes.map(node => {
      const baseFeatures = node.features;
      const scenario = scenarioMap.get(node.cellId);

      // Normalize P0 and Alpha to [-1, 1] range
      const normalizedP0 = scenario ? (scenario.p0 + 96) / 30 : 0;
      const normalizedAlpha = scenario ? scenario.alpha : 0.8;

      // Add power control features
      return [
        ...baseFeatures,
        normalizedP0,
        normalizedAlpha,
        normalizedP0 * normalizedAlpha, // Interaction term
      ];
    });
  }

  /**
   * Add interference coupling information to features
   */
  private addInterferenceFeatures(
    features: number[][],
    coupling: InterferenceCouplingMatrix,
    graph: CellGraph
  ): number[][] {
    const cellIdToIdx = new Map(coupling.cellIds.map((id, idx) => [id, idx]));

    return features.map((nodeFeatures, nodeIdx) => {
      const cellId = graph.nodes[nodeIdx].cellId;
      const couplingIdx = cellIdToIdx.get(cellId);

      if (couplingIdx === undefined) {
        return [...nodeFeatures, 0, 0, 0]; // No coupling info
      }

      // Aggregate interference coupling statistics
      const couplings = coupling.matrix[couplingIdx].filter((c, i) => i !== couplingIdx && c > 0.001);
      const totalCoupling = couplings.reduce((a, b) => a + b, 0);
      const maxCoupling = couplings.length > 0 ? Math.max(...couplings) : 0;
      const avgCoupling = couplings.length > 0 ? totalCoupling / couplings.length : 0;

      return [...nodeFeatures, totalCoupling, maxCoupling, avgCoupling];
    });
  }

  /**
   * GNN layer forward pass with multi-head attention
   */
  private gnnLayerForward(
    nodeFeatures: number[][],
    graph: CellGraph,
    layerWeights: typeof this.weights.gnnLayers[0]
  ): number[][] {
    const numNodes = nodeFeatures.length;
    const hiddenDim = this.config.hiddenDim;
    const numHeads = this.config.numHeads;
    const headDim = hiddenDim / numHeads;

    // Build adjacency from graph
    const adjacency = this.buildAdjacency(graph);

    // Compute queries, keys, values
    const queries = this.matmul(nodeFeatures, layerWeights.W_query);
    const keys = this.matmul(nodeFeatures, layerWeights.W_key);
    const values = this.matmul(nodeFeatures, layerWeights.W_value);

    // Multi-head attention aggregation
    const aggregated: number[][] = Array(numNodes).fill(null).map(() => Array(hiddenDim).fill(0));

    for (let h = 0; h < numHeads; h++) {
      const startIdx = h * headDim;
      const endIdx = (h + 1) * headDim;

      for (let i = 0; i < numNodes; i++) {
        const neighbors = adjacency.get(i) || [];
        if (neighbors.length === 0) {
          // Self-loop if no neighbors
          for (let k = startIdx; k < endIdx; k++) {
            aggregated[i][k] = values[i][k];
          }
          continue;
        }

        // Compute attention scores
        const scores: number[] = [];
        for (const j of neighbors) {
          let score = 0;
          for (let k = startIdx; k < endIdx; k++) {
            score += queries[i][k] * keys[j][k];
          }
          scores.push(score / Math.sqrt(headDim));
        }

        // Softmax
        const maxScore = Math.max(...scores);
        const expScores = scores.map(s => Math.exp(s - maxScore));
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        const attentionWeights = expScores.map(s => s / sumExp);

        // Weighted sum of neighbor values
        for (let k = startIdx; k < endIdx; k++) {
          for (let jIdx = 0; jIdx < neighbors.length; jIdx++) {
            aggregated[i][k] += attentionWeights[jIdx] * values[neighbors[jIdx]][k];
          }
        }
      }
    }

    // Output projection and residual connection
    const output = this.matmul(aggregated, layerWeights.W_out);

    // Add residual and apply layer normalization
    return this.layerNorm(this.addResidual(nodeFeatures, output));
  }

  /**
   * Build adjacency list from graph
   */
  private buildAdjacency(graph: CellGraph): Map<number, number[]> {
    const idToIdx = new Map(graph.nodes.map((n, idx) => [n.id, idx]));
    const adjacency = new Map<number, number[]>();

    for (let i = 0; i < graph.nodes.length; i++) {
      adjacency.set(i, [i]); // Include self-loop
    }

    for (const edge of graph.edges) {
      const sourceIdx = idToIdx.get(edge.source);
      const targetIdx = idToIdx.get(edge.target);

      if (sourceIdx !== undefined && targetIdx !== undefined) {
        adjacency.get(sourceIdx)?.push(targetIdx);
        adjacency.get(targetIdx)?.push(sourceIdx);
      }
    }

    return adjacency;
  }

  /**
   * Calculate prediction confidence from hidden state variance
   */
  private calculatePredictionConfidence(hiddenState: number[]): number {
    const mean = ss.mean(hiddenState);
    const std = ss.standardDeviation(hiddenState);

    // Higher variance in hidden state = lower confidence
    // Normalize to [0.5, 1] range
    const rawConfidence = 1 / (1 + std / Math.abs(mean + 0.001));
    return Math.max(0.5, Math.min(0.95, rawConfidence));
  }

  /**
   * Matrix multiplication helper
   */
  private matmul(a: number[][], b: number[][]): number[][] {
    const m = a.length;
    const n = b[0].length;
    const k = b.length;

    const result: number[][] = Array(m).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        for (let l = 0; l < k; l++) {
          result[i][j] += (a[i][l] || 0) * (b[l][j] || 0);
        }
      }
    }

    return result;
  }

  /**
   * Add residual connection with dimension matching
   */
  private addResidual(original: number[][], transformed: number[][]): number[][] {
    const m = original.length;
    const n = transformed[0].length;
    const result: number[][] = Array(m).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        const origVal = j < original[0].length ? original[i][j] : 0;
        result[i][j] = transformed[i][j] + origVal;
      }
    }

    return result;
  }

  /**
   * Layer normalization
   */
  private layerNorm(x: number[][]): number[][] {
    const eps = 1e-6;
    return x.map(row => {
      const mean = ss.mean(row);
      const std = ss.standardDeviation(row) + eps;
      return row.map(v => (v - mean) / std);
    });
  }

  /**
   * Get whether model is trained
   */
  isTrained(): boolean {
    return this.trained;
  }

  /**
   * Mark model as trained
   */
  setTrained(value: boolean): void {
    this.trained = value;
  }

  /**
   * Get model weights for serialization
   */
  getWeights(): typeof this.weights {
    return this.weights;
  }

  /**
   * Load model weights
   */
  loadWeights(weights: typeof this.weights): void {
    this.weights = weights;
    this.trained = true;
  }
}

export default {
  GNNSINRPredictor,
  InterferenceCouplingBuilder,
  DEFAULT_SINR_PREDICTOR_CONFIG,
};
