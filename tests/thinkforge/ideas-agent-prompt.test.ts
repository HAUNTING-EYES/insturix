import { describe, expect, it } from 'vitest';
import { IdeasAgent } from '@/lib/thinkforge/agents/ideas-agent';

describe('IdeasAgent prompt contract', () => {
  it('preserves calendar, public trend, and platform-ready deliverable guidance', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new IdeasAgent();

    const prompt = agent.buildPrompt({
      context: {
        projectSummary: 'NimbusOps content planning for agency operators.',
        systemBrief: 'Brand voice: calm, operational, dry humor.',
      },
      userPrompt:
        'Generate ideas for a 6-week content calendar repurposing the public trend that every app has an AI copilot button.',
    });

    expect(prompt).toContain('content calendar');
    expect(prompt).toContain('preserve that planning context');
    expect(prompt).toContain('public trend');
    expect(prompt).toContain('freshness or expiry window');
    expect(prompt).toContain('platform-ready deliverable');
    expect(prompt).toContain('LinkedIn carousel');
  });
});
