/**
 * Self-Learning LLM Router Module
 *
 * A comprehensive LLM routing solution with:
 * - SONA (Self-Optimizing Neural Architecture) for adaptive learning
 * - AgentDB integration for persistent memory and pattern matching
 * - Midstreamer-inspired temporal analysis (DTW, LCS, streaming)
 * - Multi-model routing with intelligent cost optimization
 * - ReasoningBank for pattern extraction and storage
 * - Dual learning loops (instant <1ms and background)
 *
 * @module llm-router
 */

// SONA Adapter exports
export {
  SONAAdapter,
  MicroLoRAAdapter,
  BaseLoRAAdapter,
  EWCConsolidation,
  ReasoningBank,
  DualLearningLoop,
  type LoRAConfig,
  type MicroLoRAState,
  type BaseLoRAState,
  type EWCState,
  type ReasoningPattern,
  type DualLearningState,
  type LearningEvent,
  type SONAMetrics,
} from './sona-adapter.js';

// Temporal Analyzer exports
export {
  TemporalAnalyzer,
  DTWAnalyzer,
  LCSAnalyzer,
  StreamingAnalyzer,
  TemporalForecaster,
  type TemporalSequence,
  type DTWResult,
  type LCSResult,
  type AnomalyResult,
  type StreamWindow,
  type WindowStats,
  type MetaLearningState,
  type LearnedPattern,
  type TemporalForecast,
} from './temporal-analyzer.js';

// LLM Router exports
export {
  SelfLearningLLMRouter,
  AgentDBAdapter,
  MultiModelRouter,
  type LLMModel,
  type RoutingDecision,
  type QueryContext,
  type RoutingFeedback,
  type AgentDBEntry,
  type RouterMetrics,
  type PerformanceTimeSeries,
} from './llm-router.js';

// Default export
import SelfLearningLLMRouter from './llm-router.js';
export default SelfLearningLLMRouter;

/**
 * Quick start function for creating a configured router
 */
export async function createRouter(config?: {
  enableLearning?: boolean;
  enableTemporalAnalysis?: boolean;
  enablePatternMatching?: boolean;
  minConfidenceForPattern?: number;
  temporalWindowSize?: number;
  learningRate?: number;
}): Promise<SelfLearningLLMRouter> {
  const router = new SelfLearningLLMRouter(config);
  await router.initialize();
  return router;
}

/**
 * Version information
 */
export const VERSION = '2.0.0';
export const FEATURES = [
  'SONA Self-Optimizing Neural Architecture',
  'AgentDB Persistent Memory (HNSW indexing)',
  'Midstreamer Temporal Analysis (DTW, LCS)',
  'Multi-Model Router (85-99% cost savings)',
  'ReasoningBank Pattern Extraction',
  'Dual Learning Loops (<1ms instant, periodic background)',
  'EWC++ Catastrophic Forgetting Prevention',
  'Real-time Streaming Anomaly Detection',
  'Time Series Forecasting (Holt-Winters, ARIMA)',
];
