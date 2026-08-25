import { afterEach, describe, expect, it, vi } from 'vitest';

type AssetProxyWorker = {
  fetch(request: Request): Promise<Response>;
};

const assetProxy = (await import('../../workers/clickatron-asset-proxy.js')).default as AssetProxyWorker;
const globalScope = globalThis as typeof globalThis & {
  R2_BUCKET?: { get(key: string): Promise<unknown> };
};

afterEach(() => {
  delete globalScope.R2_BUCKET;
});

describe('Clickatron asset proxy', () => {
  it.each([
    '/asset/private/editron/media-source-pts-cadence/v1/map.json',
    '/asset/private%2Feditron%2Fmedia-source-pts-cadence%2Fv1%2Fmap.json',
    '/clickatron/%70rivate/editron/media-source-pts-cadence/v1/map.json',
  ])('rejects private sidecar keys before querying R2: %s', async (pathname) => {
    const get = vi.fn();
    globalScope.R2_BUCKET = { get };

    const response = await assetProxy.fetch(new Request(`https://cdn.example.test${pathname}`));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('Private asset namespace');
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a non-read request before it can query R2', async () => {
    const get = vi.fn();
    globalScope.R2_BUCKET = { get };

    const response = await assetProxy.fetch(new Request('https://cdn.example.test/asset/public-asset', {
      method: 'POST',
    }));

    expect(response.status).toBe(405);
    expect(get).not.toHaveBeenCalled();
  });
});
