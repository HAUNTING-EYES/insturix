# D-010: Qwen3-VL Evaluation Plan

## Status: #open

## Question
When and how to evaluate Qwen3-VL 8B as a replacement/supplement for Gemini 2.5 Flash in the L1 layer.

## Why Qwen3-VL
- Native text-timestamp alignment (architecturally superior to Gemini's prompt-based approach)
- 8B model runs on single GPU (self-hostable)
- 30B-A3B MoE variant: 30B quality at 3B inference cost
- Zero rate limits if self-hosted
- Zero marginal cost if self-hosted
- Tech report: https://arxiv.org/abs/2511.21631

## Proposed Eval Method
1. Select 20 test videos across 5 content types (speech, music, visual, hybrid, silent)
2. Run same temporal grounding task on both Gemini and Qwen3-VL
3. Compare: timestamp accuracy, event detection recall, JSON output quality
4. Measure: latency, cost, reliability (rate limits, failures)
5. Score using same eval harness pattern (Rule 35)

## Prerequisites
- [[D-008-Modal-Commitment]] decided (Modal needed for GPU hosting)
- L0 + routing built and working (baseline to compare against)
- Test dataset assembled (see [[Video-Datasets]])

## Timeline
Not before L0 ships. Earliest: 2-3 weeks after L0 is production-stable.

Tags: #open #models #evaluation
