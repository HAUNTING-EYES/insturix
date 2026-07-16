import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ThinkForge generation lifecycle', () => {
  it('uses atomic ownership and terminal transitions in persistence', () => {
    const source = read('lib/thinkforge/services/db.ts');

    expect(source).toContain("'activeGeneration.id': generationId");
    expect(source).toContain("'activeGeneration.status': 'running'");
    expect(source).toContain('claimGenerationCommit');
    expect(source).toContain("'activeGeneration.commitClaimedAt': { $exists: false }");
    expect(source).not.toContain('const updatedGen = {');
  });

  it('makes refunds idempotent by the original charge transaction', () => {
    const source = read('lib/services/creditsService.ts');

    expect(source).toContain("type: 'refund'");
    expect(source).toContain("'metadata.originalTransactionId': options.originalTransactionId");
    expect(source).toContain('return { success: true, duplicate: true');
  });

  it('reserves billing before streaming and gates AI persistence on commit ownership', () => {
    const route = read('app/api/services/thinkforge/chat/route.ts');
    const service = read('lib/thinkforge/services/chat-service.ts');

    expect(route).toContain('const deduction = await creditCheck.deduct()');
    expect(route).toContain('await db.setActiveGeneration(');
    expect(route.indexOf('await db.setActiveGeneration(')).toBeLessThan(route.indexOf('processChat({'));
    expect(service).toContain('claimCommitOwnership');
    expect(service).toContain("commitPersisted || !isStreamClosed");
    expect(service.indexOf("terminalFailureMessage = 'Chat limit reached"))
      .toBeLessThan(service.indexOf("await emitEvent('done', { sessionId: canonicalSessionId, quota })"));
    expect(service).not.toContain('initializing: true');
  });
});
