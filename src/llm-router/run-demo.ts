/**
 * LLM Router Demo
 *
 * Demonstrates the Self-Learning LLM Router with:
 * - SONA adaptive learning
 * - AgentDB persistent memory
 * - Temporal analysis
 * - Multi-model routing
 */

import SelfLearningLLMRouter from './llm-router.js';

async function runDemo(): Promise<void> {
  console.log('='.repeat(70));
  console.log('  Self-Learning LLM Router Demo');
  console.log('  Powered by SONA, AgentDB, Midstreamer Temporal Analysis');
  console.log('='.repeat(70));
  console.log();

  // Initialize router
  const router = new SelfLearningLLMRouter({
    enableLearning: true,
    enableTemporalAnalysis: true,
    enablePatternMatching: true,
    minConfidenceForPattern: 0.6,
    temporalWindowSize: 50,
    learningRate: 0.1,
  });

  await router.initialize();
  console.log();

  // Demo queries
  const demoQueries = [
    {
      query: 'What is the capital of France?',
      options: { priority: 'low' as const },
      description: 'Simple factual question',
    },
    {
      query: 'Write a Python function to implement a binary search tree with insert, delete, and search operations',
      options: { priority: 'high' as const, requiredCapabilities: ['code'] },
      description: 'Complex coding task',
    },
    {
      query: 'Analyze the economic impact of artificial intelligence on the job market over the next decade',
      options: { priority: 'medium' as const, requiredCapabilities: ['analysis', 'reasoning'] },
      description: 'Analytical question',
    },
    {
      query: 'Write a creative short story about a robot who learns to paint',
      options: { priority: 'medium' as const, requiredCapabilities: ['creative'] },
      description: 'Creative writing task',
    },
    {
      query: 'Debug this error: TypeError: Cannot read property \'map\' of undefined in React component',
      options: { priority: 'high' as const, requiredCapabilities: ['code'] },
      description: 'Debugging task',
    },
    {
      query: 'Explain quantum entanglement in simple terms',
      options: { priority: 'low' as const },
      description: 'Educational explanation',
    },
    {
      query: 'Compare and contrast microservices vs monolithic architecture for a high-traffic e-commerce platform',
      options: { priority: 'high' as const, requiredCapabilities: ['analysis', 'reasoning'] },
      description: 'Technical comparison',
    },
    {
      query: 'Hello, how are you?',
      options: { priority: 'low' as const },
      description: 'Simple greeting',
    },
  ];

  console.log('Routing Demo Queries:');
  console.log('-'.repeat(70));

  for (let i = 0; i < demoQueries.length; i++) {
    const { query, options, description } = demoQueries[i];

    console.log(`\n[${i + 1}/${demoQueries.length}] ${description}`);
    console.log(`    Query: "${query.slice(0, 60)}${query.length > 60 ? '...' : ''}"`);

    const decision = router.routeQuery(query, options);

    console.log(`    Selected Model: ${decision.selectedModel}`);
    console.log(`    Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
    console.log(`    Estimated Cost: $${decision.estimatedCost.toFixed(6)}`);
    console.log(`    Estimated Latency: ${decision.estimatedLatency}ms`);
    console.log(`    Reason: ${decision.reason}`);

    if (decision.alternatives.length > 0) {
      console.log(`    Alternatives: ${decision.alternatives.map(a => a.model).join(', ')}`);
    }

    // Simulate feedback for learning
    const success = Math.random() > 0.2;
    const qualityRating = success ? 0.6 + Math.random() * 0.4 : 0.2 + Math.random() * 0.3;

    router.provideFeedback({
      routingId: decision.id,
      success,
      actualLatency: decision.estimatedLatency * (0.8 + Math.random() * 0.4),
      actualCost: decision.estimatedCost * (0.9 + Math.random() * 0.2),
      qualityRating,
      userSatisfaction: qualityRating,
    });

    // Small delay for temporal tracking
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Show metrics
  console.log('\n' + '='.repeat(70));
  console.log('  Router Metrics');
  console.log('='.repeat(70));

  const metrics = router.getMetrics();
  console.log(`\nTotal Requests: ${metrics.totalRequests}`);
  console.log(`Average Latency: ${metrics.avgLatency.toFixed(0)}ms`);
  console.log(`Average Cost: $${metrics.avgCost.toFixed(6)}`);
  console.log(`Cost Savings: ${metrics.costSavings.toFixed(1)}%`);
  console.log(`Pattern Matches: ${metrics.patternMatches}`);
  console.log(`Temporal Anomalies: ${metrics.temporalAnomalies}`);
  console.log(`Learning Progress: ${(metrics.learningProgress * 100).toFixed(2)}%`);

  console.log('\nModel Distribution:');
  for (const [model, count] of metrics.modelDistribution) {
    const percentage = (count / metrics.totalRequests * 100).toFixed(1);
    console.log(`  ${model}: ${count} (${percentage}%)`);
  }

  // SONA metrics
  console.log('\n' + '-'.repeat(70));
  console.log('SONA Metrics:');
  const sonaMetrics = router.getSONAMetrics();
  console.log(`  Instant Latency: ${sonaMetrics.instantLatency.toFixed(2)}ms`);
  console.log(`  Background Latency: ${sonaMetrics.backgroundLatency.toFixed(2)}ms`);
  console.log(`  Adaptation Rate: ${sonaMetrics.adaptationRate.toFixed(4)}/s`);
  console.log(`  Pattern Matches: ${sonaMetrics.patternMatches}`);
  console.log(`  Forgetting Prevention: ${sonaMetrics.forgettingPrevention}`);
  console.log(`  Total Adaptations: ${sonaMetrics.totalAdaptations}`);

  // AgentDB stats
  console.log('\n' + '-'.repeat(70));
  console.log('AgentDB Stats:');
  const dbStats = router.getAgentDBStats();
  console.log(`  Total Entries: ${dbStats.totalEntries}`);
  console.log(`  Avg Access Count: ${dbStats.avgAccessCount.toFixed(2)}`);
  console.log('  Categories:');
  for (const [category, count] of dbStats.categoryCounts) {
    console.log(`    ${category}: ${count}`);
  }

  // Temporal stats
  console.log('\n' + '-'.repeat(70));
  console.log('Temporal Analysis Stats:');
  const temporalStats = router.getTemporalStats();
  console.log(`  Windows Processed: ${temporalStats.streaming.windowsProcessed}`);
  console.log(`  Current Window Size: ${temporalStats.streaming.currentWindowSize}`);
  console.log(`  Total Anomalies: ${temporalStats.streaming.totalAnomalies}`);
  console.log(`  Learned Patterns: ${temporalStats.streaming.learnedPatterns}`);
  console.log(`  History Length: ${temporalStats.historyLength}`);

  // Forecast
  console.log('\n' + '-'.repeat(70));
  console.log('Performance Forecast (next 5 points):');
  const forecast = router.forecastPerformance(5);
  console.log('  Latency:');
  for (let i = 0; i < forecast.latency.values.length; i++) {
    const value = forecast.latency.values[i];
    const ci = forecast.latency.confidenceIntervals[i];
    console.log(`    t+${i + 1}: ${value.toFixed(1)}ms [${ci.lower.toFixed(1)}, ${ci.upper.toFixed(1)}]`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  Demo Complete!');
  console.log('='.repeat(70));

  // Shutdown
  router.shutdown();
}

// Run demo
runDemo().catch(console.error);
