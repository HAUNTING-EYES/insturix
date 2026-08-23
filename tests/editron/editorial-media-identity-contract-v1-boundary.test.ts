import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE_PATH = path.join(
  process.cwd(),
  'lib/editron/contracts/editorial-media-identity-contract-v1.ts',
);

describe('EditorialMediaIdentityContractV1 boundary', () => {
  it('remains a pure, unwired vocabulary and validator', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toContain("status: z.literal('UNWIRED_CONTRACT_ONLY')");
    expect(source).toContain("identityStatus: z.literal('UNQUALIFIED_LEGACY')");
    expect(source).toContain("coordinateDomain: z.literal('SOURCE_PTS')");
    expect(source).toContain("kind: z.literal('VFR')");
    expect(source).toContain('VFR_PTS_MAPPING_UNBOUND');

    for (const forbidden of [
      'ProjectService',
      'AssetResolver',
      'getDatabase',
      'updateOne',
      'insertOne',
      'fetch(',
      'process.env',
      'http://',
      'https://',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});
