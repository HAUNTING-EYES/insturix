/**
 * Token Tracker for Editron AI Chat
 * 
 * Accumulates token usage across multiple API calls in a single chat request.
 * Used for token-based credit billing.
 */

import { getCreditCost } from '@/lib/config/creditCosts';

export interface TokenUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export class TokenTracker {
  private inputTokens = 0;
  private outputTokens = 0;
  private model: string;

  constructor(model: string = 'gemini-2.5-flash') {
    this.model = model;
  }

  /**
   * Add token usage from a Gemini API response
   */
  addUsage(metadata: TokenUsageMetadata): void {
    if (metadata.promptTokenCount) {
      this.inputTokens += metadata.promptTokenCount;
    }
    if (metadata.candidatesTokenCount) {
      this.outputTokens += metadata.candidatesTokenCount;
    }
  }

  /**
   * Get total tokens consumed (input + output)
   */
  getTotalTokens(): number {
    return this.inputTokens + this.outputTokens;
  }

  /**
   * Get breakdown of input vs output tokens
   */
  getBreakdown(): { input: number; output: number; total: number } {
    return {
      input: this.inputTokens,
      output: this.outputTokens,
      total: this.getTotalTokens(),
    };
  }

  /**
   * Calculate credits consumed based on token usage
   */
  getCreditsConsumed(): number {
    const totalTokens = this.getTotalTokens();
    if (totalTokens === 0) return 0;

    return getCreditCost('editron', 'ai_chat', {
      tokenCount: totalTokens,
      model: this.model,
    });
  }

  /**
   * Get the model being tracked
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Reset the tracker (useful for testing)
   */
  reset(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
  }
}
