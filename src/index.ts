/**
 * RAN Network Analysis System
 * AI/ML-powered Radio Access Network KPI analysis, anomaly detection,
 * and power control optimization using Graph Neural Networks
 *
 * @module ran-network-analysis
 */

// Internal imports for local use
import { RANAnalysisOrchestrator as RANOrchestrator } from './agents/orchestrator.js';
import type { AnalysisResult, AnalysisRequest } from './agents/orchestrator.js';
import type { CellKPISnapshot, KPITimeSeries, NeighborRelation } from './models/ran-kpi.js';

// Models
export * from './models/ran-kpi.js';

// Analysis modules
export { default as timeSeriesAnalysis } from './analysis/time-series.js';
export { default as anomalyDetection } from './analysis/anomaly-detection.js';
export { default as classification } from './analysis/classifier.js';
export { default as rootCauseAnalysis } from './analysis/root-cause.js';

// GNN module (RuVector-based unified architecture)
export * from './gnn/index.js';

// Agent orchestration
export { default as orchestrator } from './agents/orchestrator.js';

// Re-export main classes for convenience
export {
  computeTimeSeriesStats,
  analyzeTrend,
  analyzeSeasonality,
  decomposeTimeSeries,
  forecast,
} from './analysis/time-series.js';

export {
  UnifiedAnomalyDetector,
  StatisticalAnomalyDetector,
  TrendAnomalyDetector,
  SeasonalAnomalyDetector,
  CollectiveAnomalyDetector,
  DomainAnomalyDetector,
} from './analysis/anomaly-detection.js';

export {
  CellHealthClassifier,
  AnomalyClassifier,
  IssuePatternClassifier,
} from './analysis/classifier.js';

export {
  RootCauseAnalyzer,
  MultiCellCorrelationAnalyzer,
} from './analysis/root-cause.js';

export {
  RANAnalysisOrchestrator,
  AnalysisReportGenerator,
} from './agents/orchestrator.js';

/**
 * Quick start function for running analysis
 */
export async function analyzeNetwork(options: {
  cellSnapshots: Map<string, CellKPISnapshot>;
  timeSeriesData: Map<string, KPITimeSeries[]>;
  neighborRelations: NeighborRelation[];
}): Promise<AnalysisResult> {
  const analysisOrchestrator = new RANOrchestrator();

  return analysisOrchestrator.analyze({
    ...options,
    analysisScope: {
      detectAnomalies: true,
      classifyCells: true,
      analyzeRootCause: true,
      optimizePowerControl: true,
      generateReport: true,
    },
  });
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('RAN Network Analysis System v1.0.0');
  console.log('');
  console.log('Usage:');
  console.log('  npm run dev           - Run development server');
  console.log('  npm run analyze       - Run analysis on sample data');
  console.log('  npm run gnn:train     - Train GNN model');
  console.log('  npm run agents:start  - Start agent orchestrator');
  console.log('');
  console.log('For programmatic use:');
  console.log('  import { analyzeNetwork } from "ran-network-analysis"');
}
