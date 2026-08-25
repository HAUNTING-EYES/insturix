import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Gemma editorial Modal deployment boundary', () => {
  it('requires Modal proxy authentication and the research probe sends only proxy headers', async () => {
    const root = process.cwd();
    const [endpoint, probe] = await Promise.all([
      readFile(path.join(root, 'modal/gemma-editorial/finetune_and_deploy.py'), 'utf8'),
      readFile(path.join(root, 'modal/gemma-editorial/test_endpoint.py'), 'utf8'),
    ]);

    expect(endpoint).toContain('@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)');
    expect(probe).toContain('"Modal-Key": modal_key');
    expect(probe).toContain('"Modal-Secret": modal_secret');
    expect(probe).toContain('EDITRON_MODAL_PROXY_AUTH_TOKEN_ID');
    expect(probe).toContain('EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET');
    expect(probe).not.toContain('MODAL_TOKEN_ID');
    expect(probe).not.toContain('Authorization');
  });
});
