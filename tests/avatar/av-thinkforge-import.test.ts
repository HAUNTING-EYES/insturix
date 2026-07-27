import { describe, expect, it } from 'vitest';
import {
  extractScriptContent,
  extractScriptList,
  scriptGetUrl,
  thinkForgeGenerateHref,
} from '../../components/dashboard/avatar-vault/v2/av-thinkforge-import';

describe('thinkForgeGenerateHref', () => {
  it('routes to ThinkForge carrying the avatar id and a return link', () => {
    const href = thinkForgeGenerateHref('avatar_rec_123');
    expect(href.startsWith('/dashboard/thinkforge?')).toBe(true);
    expect(href).toContain('sourceAvatarId=avatar_rec_123');
    expect(href).toContain('returnTo=%2Fdashboard%2Favatar-vault');
  });
});

describe('extractScriptList', () => {
  it('normalizes rows, defaults the title, and drops rows without a session', () => {
    const list = extractScriptList({
      scripts: [
        { scriptId: 's1', sessionId: 'sess1', title: 'Launch VO', updatedAt: '2026-07-10' },
        { sessionId: 'sess2' }, // no title/scriptId → defaults
        { scriptId: 's3', title: 'orphan' }, // no sessionId → dropped
        'garbage',
      ],
    });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ scriptId: 's1', sessionId: 'sess1', title: 'Launch VO' });
    expect(list[1]).toMatchObject({ scriptId: 'default', sessionId: 'sess2', title: 'Untitled Script' });
  });

  it('returns [] for a malformed response', () => {
    expect(extractScriptList(null)).toEqual([]);
    expect(extractScriptList({})).toEqual([]);
  });
});

describe('extractScriptContent', () => {
  it('pulls the plain script text', () => {
    expect(extractScriptContent({ script: { content: 'Hello there.' } })).toBe('Hello there.');
  });
  it('returns null when empty or missing', () => {
    expect(extractScriptContent({ script: { content: '   ' } })).toBeNull();
    expect(extractScriptContent({ script: {} })).toBeNull();
    expect(extractScriptContent(null)).toBeNull();
  });
});

describe('scriptGetUrl', () => {
  it('builds the get URL with session + script id', () => {
    expect(scriptGetUrl({ sessionId: 'sess1', scriptId: 's1' })).toBe(
      '/api/services/thinkforge/script/get?sessionId=sess1&scriptId=s1',
    );
  });
});
