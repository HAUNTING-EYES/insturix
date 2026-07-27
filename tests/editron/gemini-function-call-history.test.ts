import { describe, expect, it } from 'vitest';

import {
  buildDeterministicGeminiFunctionCallPart,
  DETERMINISTIC_GEMINI_THOUGHT_SIGNATURE,
} from '@/lib/editron/agent/gemini-function-call-history';

describe('deterministic Gemini function-call history', () => {
  it('marks server-injected calls with Gemini documented validation bypass', () => {
    expect(buildDeterministicGeminiFunctionCallPart({
      name: 'get_timeline_view',
      args: { granularity: 'detailed' },
    })).toEqual({
      functionCall: {
        name: 'get_timeline_view',
        args: { granularity: 'detailed' },
      },
      thoughtSignature: DETERMINISTIC_GEMINI_THOUGHT_SIGNATURE,
    });
  });

  it('does not rewrite the supplied function call arguments', () => {
    const args = {
      overlayId: 'overlay-1',
      patch: { content: '<div>Updated</div>' },
    };

    const part = buildDeterministicGeminiFunctionCallPart({
      name: 'edit_html_scene',
      args,
    });

    expect(part.functionCall.args).toBe(args);
  });
});
