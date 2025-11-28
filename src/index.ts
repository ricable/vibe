/**
 * RAN Network Analysis System
 * AI/ML-powered Radio Access Network KPI analysis, anomaly detection,
 * and power control optimization using Graph Neural Networks
 *
 * @module ran-network-analysis
 */

// Models
export * from './models/ran-kpi.js';

// Analysis modules
export { default as timeSeriesAnalysis } from './analysis/time-series.js';
export { default as anomalyDetection } from './analysis/anomaly-detection.js';
export { default as classification } from './analysis/classifier.js';
export { default as rootCauseAnalysis } from './analysis/root-cause.js';

// GNN modules
export { default as cellGraph } from './gnn/cell-graph.js';
export { default as uplinkPowerControl } from './gnn/uplink-power-control.js';

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
  CellGraphBuilder,
  GNNLayer,
  CellGNN,
  SINRNeighborAnalyzer,
} from './gnn/cell-graph.js';

export {
  PathLossAnalyzer,
  FractionalPathLossOptimizer,
  GNNPowerControlOptimizer,
  PowerControlValidator,
} from './gnn/uplink-power-control.js';

export {
  RANAnalysisOrchestrator,
  AnalysisReportGenerator,
} from './agents/orchestrator.js';

/**
 * Quick start function for running analysis
 */
export async function analyzeNetwork(options: {
  cellSnapshots: Map<string, import('./models/ran-kpi.js').CellKPISnapshot>;
  timeSeriesData: Map<string, import('./models/ran-kpi.js').KPITimeSeries[]>;
  neighborRelations: import('./models/ran-kpi.js').NeighborRelation[];
}): Promise<import('./agents/orchestrator.js').AnalysisResult> {
  const orchestrator = new RANAnalysisOrchestrator();

  return orchestrator.analyze({
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
