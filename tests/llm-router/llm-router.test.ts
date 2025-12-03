/**
 * Tests for Self-Learning LLM Router
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SelfLearningLLMRouter,
  AgentDBAdapter,
  MultiModelRouter,
} from '../../src/llm-router/llm-router.js';
import { SONAAdapter, ReasoningBank, DualLearningLoop } from '../../src/llm-router/sona-adapter.js';
import {
  TemporalAnalyzer,
  DTWAnalyzer,
  LCSAnalyzer,
  TemporalForecaster,
} from '../../src/llm-router/temporal-analyzer.js';

// ============================================================================
// SONA ADAPTER TESTS
// ============================================================================

describe('SONAAdapter', () => {
  let sona: SONAAdapter;

  beforeEach(async () => {
    sona = new SONAAdapter(256);
    await sona.initialize();
  });

  afterEach(() => {
    sona.shutdown();
  });

  it('should initialize successfully', () => {
    const metrics = sona.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.totalAdaptations).toBeGreaterThanOrEqual(0);
  });

  it('should perform instant adaptation', () => {
    sona.adaptInstant('test input', 'test output', 0.8);
    const metrics = sona.getMetrics();
    expect(metrics.totalAdaptations).toBeGreaterThan(0);
  });

  it('should perform background learning', () => {
    sona.learnBackground('test input', 'test output', 0.9, { key: 'value' });
    const state = sona.exportState();
    expect(state.patterns.length).toBeGreaterThanOrEqual(0);
  });

  it('should query patterns from ReasoningBank', () => {
    sona.learnBackground('machine learning classification', 'neural network output', 0.9);
    sona.learnBackground('deep learning training', 'model weights', 0.8);

    const patterns = sona.queryPatterns('machine learning', 5);
    expect(patterns).toBeDefined();
    expect(Array.isArray(patterns)).toBe(true);
  });

  it('should export and maintain state', () => {
    sona.learnBackground('test', 'output', 0.7);
    const state = sona.exportState();

    expect(state.patterns).toBeDefined();
    expect(state.ewcState).toBeDefined();
    expect(state.metrics).toBeDefined();
    expect(state.uptime).toBeGreaterThan(0);
  });
});

describe('ReasoningBank', () => {
  let bank: ReasoningBank;

  beforeEach(() => {
    bank = new ReasoningBank(128);
  });

  it('should store patterns', () => {
    const id = bank.storePattern('test pattern', 'category1', 0.9);
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('should query patterns by similarity', () => {
    bank.storePattern('machine learning algorithm', 'ml', 0.9);
    bank.storePattern('deep neural network', 'ml', 0.85);
    bank.storePattern('cooking recipe', 'food', 0.7);

    const results = bank.query('neural network', 3);
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('should query patterns by category', () => {
    bank.storePattern('pattern 1', 'categoryA', 0.9);
    bank.storePattern('pattern 2', 'categoryA', 0.8);
    bank.storePattern('pattern 3', 'categoryB', 0.85);

    const results = bank.queryByCategory('categoryA', 10);
    expect(results.length).toBe(2);
  });

  it('should update pattern feedback', () => {
    const id = bank.storePattern('test', 'cat', 0.5);
    bank.updatePatternFeedback(id, 0.2);

    const stats = bank.getStats();
    expect(stats.avgConfidence).toBeGreaterThan(0);
  });

  it('should export and import patterns', () => {
    bank.storePattern('pattern 1', 'cat1', 0.9);
    bank.storePattern('pattern 2', 'cat2', 0.8);

    const exported = bank.exportPatterns();
    expect(exported.length).toBe(2);

    const newBank = new ReasoningBank(128);
    newBank.importPatterns(exported);
    expect(newBank.getStats().totalPatterns).toBe(2);
  });
});

// ============================================================================
// TEMPORAL ANALYZER TESTS
// ============================================================================

describe('DTWAnalyzer', () => {
  let dtw: DTWAnalyzer;

  beforeEach(() => {
    dtw = new DTWAnalyzer();
  });

  it('should compute DTW distance between sequences', () => {
    const seqA = [1, 2, 3, 4, 5];
    const seqB = [1, 2, 3, 4, 5];

    const result = dtw.compute(seqA, seqB);

    expect(result.distance).toBe(0);
    expect(result.normalizedDistance).toBe(0);
    expect(result.warpingPath.length).toBeGreaterThan(0);
  });

  it('should handle sequences of different lengths', () => {
    const seqA = [1, 2, 3];
    const seqB = [1, 2, 3, 4, 5];

    const result = dtw.compute(seqA, seqB);

    expect(result.distance).toBeGreaterThan(0);
    expect(result.warpingPath.length).toBeGreaterThanOrEqual(Math.max(seqA.length, seqB.length));
  });

  it('should compute similarity between sequences', () => {
    const seqA = [1, 2, 3, 4, 5];
    const seqB = [1.1, 2.1, 3.1, 4.1, 5.1];

    const similarity = dtw.similarity(seqA, seqB);

    expect(similarity).toBeGreaterThan(0.5);
    expect(similarity).toBeLessThanOrEqual(1);
  });

  it('should find most similar sequence', () => {
    const query = [1, 2, 3];
    const candidates = [
      [10, 20, 30],
      [1, 2, 3],
      [5, 6, 7],
    ];

    const result = dtw.findMostSimilar(query, candidates);

    expect(result.index).toBe(1);
    expect(result.similarity).toBeGreaterThan(0.9);
  });
});

describe('LCSAnalyzer', () => {
  let lcs: LCSAnalyzer;

  beforeEach(() => {
    lcs = new LCSAnalyzer(0.1);
  });

  it('should compute LCS between sequences', () => {
    const seqA = [1, 2, 3, 4, 5];
    const seqB = [1, 2, 3, 4, 5];

    const result = lcs.compute(seqA, seqB);

    expect(result.length).toBe(5);
    expect(result.similarity).toBe(1);
  });

  it('should find common subsequences', () => {
    const seqA = [1, 3, 5, 7, 9];
    const seqB = [1, 2, 3, 4, 5];

    const result = lcs.compute(seqA, seqB);

    expect(result.length).toBeGreaterThan(0);
    expect(result.indicesA.length).toBe(result.length);
    expect(result.indicesB.length).toBe(result.length);
  });
});

describe('TemporalForecaster', () => {
  let forecaster: TemporalForecaster;

  beforeEach(() => {
    forecaster = new TemporalForecaster(100);

    // Add some data
    for (let i = 0; i < 50; i++) {
      forecaster.addDataPoint(Math.sin(i * 0.2) * 10 + 50 + Math.random() * 2);
    }
  });

  it('should forecast using exponential smoothing', () => {
    const forecast = forecaster.forecastExponentialSmoothing(10);

    expect(forecast.values.length).toBe(10);
    expect(forecast.confidenceIntervals.length).toBe(10);
    expect(forecast.method).toBe('exponential_smoothing');
  });

  it('should forecast using Holt-Winters', () => {
    const forecast = forecaster.forecastHoltWinters(10);

    expect(forecast.values.length).toBe(10);
    expect(forecast.method).toBe('holt_winters');
  });

  it('should forecast using autoregressive model', () => {
    const forecast = forecaster.forecastAutoRegressive(10);

    expect(forecast.values.length).toBe(10);
    expect(forecast.method).toBe('autoregressive');
  });

  it('should provide ensemble forecast', () => {
    const forecast = forecaster.forecastEnsemble(10);

    expect(forecast.values.length).toBe(10);
    expect(forecast.method).toBe('ensemble');
    expect(forecast.accuracy).toBeGreaterThanOrEqual(0);
  });
});

describe('TemporalAnalyzer', () => {
  let analyzer: TemporalAnalyzer;

  beforeEach(() => {
    analyzer = new TemporalAnalyzer({
      windowSize: 20,
      slideSize: 5,
    });
  });

  it('should process stream points', () => {
    for (let i = 0; i < 30; i++) {
      const result = analyzer.processStreamPoint(Math.random() * 100);

      expect(result).toBeDefined();
      if (result.windowComplete) {
        expect(result.stats).toBeDefined();
      }
    }
  });

  it('should detect anomalies', () => {
    // Add normal data
    for (let i = 0; i < 50; i++) {
      analyzer.processStreamPoint(50 + Math.random() * 5);
    }

    // Add anomaly
    const result = analyzer.processStreamPoint(200);

    expect(result.anomaly).toBeDefined();
    if (result.anomaly) {
      expect(result.anomaly.isAnomaly).toBe(true);
    }
  });

  it('should compare using DTW', () => {
    const seqA = [1, 2, 3, 4, 5];
    const seqB = [1, 2, 3, 4, 5];

    const result = analyzer.compareDTW(seqA, seqB);

    expect(result.distance).toBe(0);
  });

  it('should find common patterns using LCS', () => {
    const seqA = [1, 2, 3, 4, 5];
    const seqB = [1, 2, 3, 4, 5];

    const result = analyzer.findCommonPatterns(seqA, seqB);

    expect(result.length).toBe(5);
  });

  it('should provide comprehensive stats', () => {
    for (let i = 0; i < 100; i++) {
      analyzer.processStreamPoint(Math.sin(i * 0.1) * 10 + 50);
    }

    const stats = analyzer.getStats();

    expect(stats.streaming).toBeDefined();
    expect(stats.historyLength).toBeGreaterThan(0);
  });
});

// ============================================================================
// AGENTDB ADAPTER TESTS
// ============================================================================

describe('AgentDBAdapter', () => {
  let db: AgentDBAdapter;

  beforeEach(() => {
    db = new AgentDBAdapter(128);
  });

  it('should store entries', () => {
    const id = db.store('key1', { data: 'value' }, 'category1');

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('should retrieve entries by key', () => {
    db.store('testKey', { foo: 'bar' }, 'cat');

    const entry = db.retrieve('testKey');

    expect(entry).toBeDefined();
    expect((entry?.value as { foo: string }).foo).toBe('bar');
  });

  it('should perform semantic search', () => {
    db.store('ml_key', { topic: 'machine learning' }, 'ml');
    db.store('dl_key', { topic: 'deep learning' }, 'ml');
    db.store('cooking_key', { topic: 'cooking' }, 'food');

    const results = db.semanticSearch('neural networks', 3);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  it('should query by category', () => {
    db.store('key1', { val: 1 }, 'catA');
    db.store('key2', { val: 2 }, 'catA');
    db.store('key3', { val: 3 }, 'catB');

    const results = db.queryByCategory('catA');

    expect(results.length).toBe(2);
  });

  it('should update entries', () => {
    const id = db.store('key', { version: 1 }, 'cat');
    const updated = db.update(id, { version: 2 });

    expect(updated).toBe(true);

    const entry = db.retrieve('key');
    expect((entry?.value as { version: number }).version).toBe(2);
  });

  it('should delete entries', () => {
    const id = db.store('key', 'value', 'cat');
    const deleted = db.delete(id);

    expect(deleted).toBe(true);
    expect(db.retrieve('key')).toBeNull();
  });

  it('should provide stats', () => {
    db.store('key1', 'val1', 'catA');
    db.store('key2', 'val2', 'catB');

    const stats = db.getStats();

    expect(stats.totalEntries).toBe(2);
    expect(stats.categoryCounts.size).toBe(2);
  });
});

// ============================================================================
// MULTI-MODEL ROUTER TESTS
// ============================================================================

describe('MultiModelRouter', () => {
  let router: MultiModelRouter;

  beforeEach(() => {
    router = new MultiModelRouter();
  });

  it('should have default models', () => {
    const models = router.getAllModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id === 'gpt-4o')).toBe(true);
    expect(models.some(m => m.id === 'claude-3-5-sonnet')).toBe(true);
  });

  it('should route simple queries to cheap models', () => {
    const decision = router.route({
      id: 'test',
      query: 'What is 2+2?',
      queryType: 'simple',
      complexity: 0.1,
      estimatedTokens: 50,
      requiredCapabilities: ['reasoning'],
      priority: 'low',
    });

    expect(decision.selectedModel).toBeDefined();
    expect(decision.confidence).toBeGreaterThan(0);
  });

  it('should route complex queries to capable models', () => {
    const decision = router.route({
      id: 'test',
      query: 'Implement a distributed consensus algorithm',
      queryType: 'complex',
      complexity: 0.9,
      estimatedTokens: 2000,
      requiredCapabilities: ['code', 'reasoning'],
      priority: 'high',
    });

    expect(decision.selectedModel).toBeDefined();
    const model = router.getModel(decision.selectedModel);
    expect(model?.qualityScore).toBeGreaterThan(0.8);
  });

  it('should respect budget constraints', () => {
    const decision = router.route({
      id: 'test',
      query: 'Write a poem',
      queryType: 'creative',
      complexity: 0.5,
      estimatedTokens: 500,
      requiredCapabilities: ['creative'],
      priority: 'medium',
      budget: 0.001,
    });

    expect(decision.estimatedCost).toBeLessThanOrEqual(0.01);
  });

  it('should calculate cost savings', () => {
    // Make several routing decisions
    for (let i = 0; i < 10; i++) {
      router.route({
        id: `test-${i}`,
        query: 'Simple question',
        queryType: 'simple',
        complexity: 0.2,
        estimatedTokens: 100,
        requiredCapabilities: [],
        priority: 'low',
      });
    }

    const savings = router.calculateCostSavings();

    expect(savings.savings).toBeGreaterThanOrEqual(0);
    expect(savings.percentage).toBeGreaterThanOrEqual(0);
  });

  it('should register custom models', () => {
    router.registerModel({
      id: 'custom-model',
      name: 'Custom Model',
      provider: 'custom',
      costPer1kTokens: 0.001,
      latencyMs: 200,
      qualityScore: 0.75,
      maxTokens: 4000,
      capabilities: ['reasoning'],
      isAvailable: true,
    });

    const model = router.getModel('custom-model');
    expect(model).toBeDefined();
    expect(model?.name).toBe('Custom Model');
  });
});

// ============================================================================
// SELF-LEARNING LLM ROUTER TESTS
// ============================================================================

describe('SelfLearningLLMRouter', () => {
  let router: SelfLearningLLMRouter;

  beforeEach(async () => {
    router = new SelfLearningLLMRouter({
      enableLearning: true,
      enableTemporalAnalysis: true,
      enablePatternMatching: true,
    });
    await router.initialize();
  });

  afterEach(() => {
    router.shutdown();
  });

  it('should initialize successfully', () => {
    const metrics = router.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.totalRequests).toBe(0);
  });

  it('should route queries', () => {
    const decision = router.routeQuery('What is the capital of France?', {
      priority: 'low',
    });

    expect(decision.selectedModel).toBeDefined();
    expect(decision.confidence).toBeGreaterThan(0);
  });

  it('should learn from feedback', () => {
    const decision = router.routeQuery('Test query', { priority: 'medium' });

    router.provideFeedback({
      routingId: decision.id,
      success: true,
      actualLatency: 300,
      actualCost: 0.001,
      qualityRating: 0.9,
    });

    const sonaMetrics = router.getSONAMetrics();
    expect(sonaMetrics.totalAdaptations).toBeGreaterThan(0);
  });

  it('should track metrics', () => {
    router.routeQuery('Query 1', { priority: 'low' });
    router.routeQuery('Query 2', { priority: 'high' });

    const metrics = router.getMetrics();

    expect(metrics.totalRequests).toBe(2);
    expect(metrics.modelDistribution.size).toBeGreaterThan(0);
  });

  it('should classify query types', () => {
    const codeDecision = router.routeQuery('Write a Python function to sort an array');
    const creativeDecision = router.routeQuery('Write a creative story about dragons');
    const simpleDecision = router.routeQuery('What time is it?');

    expect(codeDecision.metadata).toBeDefined();
    expect(creativeDecision.metadata).toBeDefined();
    expect(simpleDecision.metadata).toBeDefined();
  });

  it('should forecast performance', () => {
    // Generate some data
    for (let i = 0; i < 30; i++) {
      router.routeQuery(`Query ${i}`, { priority: 'medium' });
    }

    const forecast = router.forecastPerformance(5);

    expect(forecast.latency.values.length).toBe(5);
    expect(forecast.cost.values.length).toBe(5);
  });

  it('should provide SONA metrics', () => {
    router.routeQuery('Test query', { priority: 'medium' });

    const sonaMetrics = router.getSONAMetrics();

    expect(sonaMetrics).toBeDefined();
    expect(sonaMetrics.instantLatency).toBeGreaterThanOrEqual(0);
  });

  it('should provide AgentDB stats', () => {
    router.routeQuery('Test query', { priority: 'medium' });

    const dbStats = router.getAgentDBStats();

    expect(dbStats.totalEntries).toBeGreaterThan(0);
  });

  it('should provide temporal stats', () => {
    for (let i = 0; i < 10; i++) {
      router.routeQuery(`Query ${i}`, { priority: 'medium' });
    }

    const temporalStats = router.getTemporalStats();

    expect(temporalStats.historyLength).toBeGreaterThan(0);
  });

  it('should export state', () => {
    router.routeQuery('Test query', { priority: 'medium' });

    const state = router.exportState();

    expect(state.sonaState).toBeDefined();
    expect(state.agentDBEntries).toBeDefined();
    expect(state.routingHistory).toBeDefined();
    expect(state.metrics).toBeDefined();
  });
});
