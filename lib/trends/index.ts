/**
 * Insturix Trends — public entry point (Master v1.1 §7).
 *
 * The exemplar-bearing trend pipeline (fetch → rank → TrendSpec), distinct from lib/calos/trends
 * (planner topic-trends). Phase 1 = the ranking engine; fetchers + cron + demand store land next.
 */

export * from './rank';
export * from './fetcher';
export * from './demand';
export * from './pipeline';
export * from './store';
