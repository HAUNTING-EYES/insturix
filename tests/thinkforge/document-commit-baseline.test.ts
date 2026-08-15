import { describe, expect, it } from 'vitest';
import {
  createThinkForgeDocumentCommitBaseline,
  resolveThinkForgeCommitBaseVersion,
} from '@/lib/thinkforge/document-commit-baseline';

describe('ThinkForge document commit baseline', () => {
  it('commits an existing document against the version generation read', () => {
    const baseline = createThinkForgeDocumentCommitBaseline('post_1', 7);

    expect(resolveThinkForgeCommitBaseVersion(baseline, 'post_1')).toBe(7);
  });

  it('starts a newly allocated document at version zero', () => {
    const baseline = createThinkForgeDocumentCommitBaseline('default', 4);

    expect(resolveThinkForgeCommitBaseVersion(baseline, 'new_script')).toBe(0);
    expect(resolveThinkForgeCommitBaseVersion(null, 'new_script')).toBe(0);
  });

  it('rejects invalid identities and versions instead of guessing', () => {
    expect(() => createThinkForgeDocumentCommitBaseline(' ', 1)).toThrow(/document ID/i);
    expect(() => createThinkForgeDocumentCommitBaseline('post_1', -1)).toThrow(/version/i);
    expect(() => resolveThinkForgeCommitBaseVersion(null, ' ')).toThrow(/target document ID/i);
  });
});
