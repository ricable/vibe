/**
 * GNN Module - RuVector-Only Architecture
 *
 * Unified exports for the Graph Neural Network module.
 * Uses RuVector as the single self-learning GNN implementation.
 */

// ============================================================================
// CORE GNN (RuVector Implementation)
// ============================================================================

export {
  // Main GNN Classes
  SelfLearningUplinkGNN,
  RuVectorGNNLayer,
  EricssonUplinkOptimizer,

  // Learning Components
  ExperienceReplayBuffer,
  DifferentiableParameterSearch,
  InterferenceAwareCandidateGenerator,

  // RuVector Functions
  runRuVectorGNNLayer,
  compressEmbeddings,
  differentiableSearch,

  // Types
  type RuVectorLayerConfig,
  type LearningMetrics,
  type SelfLearningState,
  type CompressionLevel,
  type CompressedTensor,
  type ExperienceSample,
} from './self-learning-uplink-gnn.js';

// ============================================================================
// GRAPH BUILDING & UTILITIES
// ============================================================================

export {
  // Graph Construction
  SurrogateGraphBuilder,
  IssueCellDetector,
  SurrogateVisualizer,

  // Optimizer (uses SelfLearningUplinkGNN internally)
  SurrogateOptimizer,

  // Configuration
  DEFAULT_SURROGATE_CONFIG,

  // Types
  type SurrogateGraph,
  type SurrogateModelConfig,
  type PowerControlParams,
  type CellStatus,
  type CellOptimizationResult,
  type NetworkOptimizationResult,
  type TrainingSample,
} from './network-surrogate-model.js';

// ============================================================================
// UTILITY CLASSES
// ============================================================================

export {
  // Path Loss Analysis
  PathLossAnalyzer,

  // Validation
  PowerControlValidator,

  // SINR Analysis
  SINRNeighborAnalyzer,

  // Types
  type PathLossDistribution,
} from './gnn-utils.js';

// ============================================================================
// CLUSTER OPTIMIZATION
// ============================================================================

export {
  NetworkClusterOptimizer,
  ClusterIdentifier,
  ClusterOptimizer,
} from './cluster-optimizer.js';

// ============================================================================
// PARALLEL OPTIMIZATION
// ============================================================================

export {
  // Main parallel optimizer
  ParallelNetworkOptimizer,

  // Data structures
  BatchCellData,
  NeighborIndex,
  WorkerPool,

  // Parallel generators
  generateCellsParallel,
  generateNeighborsParallel,

  // Batch optimization function
  optimizeCellBatch,

  // Configuration
  DEFAULT_PARALLEL_CONFIG,

  // Types
  type ParallelConfig,
  type ParallelOptimizationResult,
} from './parallel-optimizer.js';
