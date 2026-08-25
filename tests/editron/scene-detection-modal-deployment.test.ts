import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('scene detection Modal deployment contract', () => {
  it('requires Modal proxy authentication instead of accepting generic API tokens', async () => {
    const source = await readFile(
      path.join(process.cwd(), 'modal/scene_detection_ffmpeg.py'),
      'utf8',
    );

    expect(source).toContain('@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)');
    expect(source).toContain('Auth:     Modal proxy authentication (Modal-Key / Modal-Secret)');
    expect(source).not.toContain('Auth:     Token {MODAL_TOKEN_ID}:{MODAL_TOKEN_SECRET}');
    expect(source).toContain('"error": "scene_detection_failed"');
    expect(source).not.toContain('"error": str(e)');
    expect(source).not.toContain('failed: {e}');
  });
});
