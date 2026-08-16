import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { formatTrendBriefForPrompt } from '@/lib/thinkforge/agents/trend-brief-context';

function productionBriefWithTrend(): ProductionBrief {
  return {
    output: {
      platform: 'linkedin',
      targetDurationSec: 420,
      aspectRatio: '1:1',
      count: 1,
      intent: 'Repurpose a public trend into a brand post',
      format: 'reel',
    },
    resolution: {
      fieldConfidence: { platform: 1, targetDurationSec: 1 },
      confirmed: ['platform', 'targetDurationSec'],
      inferred: [],
    },
    entryPoint: 'thinkforge',
    trend: {
      trendId: 'trend_pov_drop_reveal',
      alignmentFrame: 'beat-space',
      applicationMode: 'embedded_motif',
      naturalDurationSec: 7.5,
      selectedDurationSec: 7.5,
      durationBoundariesSec: [3.281, 7.5],
      copyFields: [
        { id: 'hook', role: 'hook', template: 'POV: you just found {thing}', maxChars: 40 },
        { id: 'cta', role: 'cta', template: '{action} - link in bio', maxChars: 30 },
      ],
      constraints: [
        {
          id: 'trend_1_decisionStream_cut_on_drop',
          layer: 'decisionStream',
          feature: 'cut_on_drop',
          support: 0.9,
          anchor: { beat: 7, sectionId: 's_reveal' },
        },
      ],
      choices: [
        {
          id: 'trend_choice_1_blocking_subject',
          layer: 'blocking',
          feature: 'subject',
          freedomRange: ['creator', 'product', 'screen'],
        },
      ],
      performanceScript: 'Beat 0-6: build anticipation. Beat 7: reveal and react.',
      hashtags: ['#fyp', '#brand'],
      warnings: ['explicit_duration_preserved_trend_used_as_motif'],
    },
  };
}

describe('formatTrendBriefForPrompt', () => {
  it('returns an empty block when the production brief has no trend', () => {
    const brief = productionBriefWithTrend();
    delete brief.trend;

    expect(formatTrendBriefForPrompt(brief)).toBe('');
    expect(formatTrendBriefForPrompt(null)).toBe('');
  });

  it('renders the TrendSpec read-contract as bounded authoring guidance', () => {
    const block = formatTrendBriefForPrompt(productionBriefWithTrend());

    expect(block).toContain('<trend_brief source="production_brief">');
    expect(block).toContain('Trend ID: trend_pov_drop_reveal');
    expect(block).toContain('Timing application: embedded_motif.');
    expect(block).toContain('Duration: natural 7.5s, selected 7.5s.');
    expect(block).toContain('Whole-section duration boundaries: 3.281s, 7.5s.');
    expect(block).toContain('Never change the final output runtime to match the trend.');
    expect(block).toContain('Apply the 7.5s trend timing once as a bounded motif inside the 420s output.');
    expect(block).toContain('Do not repeat, stretch, or pad the motif to fill the full runtime.');
    expect(block).toContain('Treat copy slots as required semantic beats, not visible labels.');
    expect(block).toContain('- hook (hook, max 40 chars): POV: you just found {thing}');
    expect(block).toContain('- cta (cta, max 30 chars): {action} - link in bio');
    expect(block).toContain('trend_1_decisionStream_cut_on_drop: decisionStream.cut_on_drop; support=0.9 anchor=s_reveal/beat 7');
    expect(block).toContain('trend_choice_1_blocking_subject: blocking.subject; allowed range/options: creator, product, screen');
    expect(block).toContain('Beat 0-6: build anticipation. Beat 7: reveal and react.');
    expect(block).toContain('Suggested trend hashtags: #fyp #brand');
    expect(block).toContain('Trend warnings: explicit_duration_preserved_trend_used_as_motif');
    expect(block).toContain('</trend_brief>');
  });

  it('wires the same trend brief contract into post and script writers', () => {
    const postSource = readFileSync('lib/thinkforge/agents/post-writer-agent.ts', 'utf8');
    const scriptSource = readFileSync('lib/thinkforge/agents/script-writer-agent.ts', 'utf8');

    expect(postSource).toContain("productionBrief?: ProductionBrief | null;");
    expect(postSource).toContain("import { formatTrendBriefForPrompt } from './trend-brief-context';");
    expect(postSource).toContain('const trendBriefBlock = formatTrendBriefForPrompt(productionBrief);');
    const trendBriefInjection = '${trendBriefBlock ? `${trendBriefBlock}\\n\\n` : \'\'}';
    expect(postSource).toContain(trendBriefInjection);
    expect(postSource.indexOf(trendBriefInjection)).toBeLessThan(postSource.indexOf('${outputFormat}'));

    expect(scriptSource).toContain("import { formatTrendBriefForPrompt } from './trend-brief-context';");
    expect(scriptSource).toContain('const trendBriefBlock = formatTrendBriefForPrompt(productionBrief);');
    expect(scriptSource).toContain('prompt += `${trendBriefBlock}\\n\\n`;');
  });
});
