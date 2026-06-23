import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeEditronBrandSettingsToBrandVault } from '@/lib/editron/services/editron-brand-vault-evidence';
import { createInMemoryBrandVaultRefineryStore } from '@/lib/shared/brand-vault-refinery-api';

describe('Editron brand settings Brand Vault evidence', () => {
  it('stages manual Editron brand settings as reviewable weighted Brand Vault evidence', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const result = await writeEditronBrandSettingsToBrandVault({
      userId: 'user_editron',
      actorId: 'user_editron',
      source: 'manual_brand_create',
      now: '2026-06-24T03:00:00.000Z',
      store,
      brand: {
        brandId: 'brand_editron',
        userId: 'user_editron',
        orgId: 'org_editron',
        name: 'Insturix',
        industry: 'content production software',
        colors: ['#101820', '#ffcc00', '#f8fafc'],
        voiceDescription: 'Direct, systems-led, anti-fluff.',
        visualStyle: 'minimal structured technical dashboard with sharp energetic motion',
        typography: 'Space Grotesk, uppercase geometric sans',
      },
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ candidateCount: expect.any(Number) });
    if (!result.ok || result.skipped) throw new Error('expected Editron Brand Vault write');
    expect(result.candidateCount).toBeGreaterThan(12);

    const snapshot = await store.getJobSnapshot(result.jobId);
    expect(snapshot?.job).toMatchObject({
      status: 'needs_review',
      brandId: 'brand_editron',
      userId: 'user_editron',
      orgId: 'org_editron',
    });
    expect(snapshot?.recordId).toBe(result.recordId);
    expect(snapshot?.reviewPayload?.reviewRequired).toBe(true);

    const paths = snapshot?.candidates.map((candidate) => candidate.signalPath) ?? [];
    expect(paths).toEqual(expect.arrayContaining([
      'identity.brandName',
      'identity.industry',
      'identity.category',
      'palette.primary',
      'palette.accent',
      'palette.supporting',
      'typography.raw',
      'voice.recurringPhrases',
      'visual.minimalism',
      'motion.motionEnergy',
    ]));

    const primary = snapshot?.candidates.find((candidate) => candidate.signalPath === 'palette.primary');
    expect(primary).toMatchObject({
      sourceType: 'manual_user',
      sourceField: 'editron.brand.colors.0',
      normalizedValue: '#101820',
      trustLevel: 'manual_user_entry',
      authorityClass: 'manual',
      learningWeight: {
        category: 'invented',
        service: 'editron',
        editType: 'manual_brand_dna_edit',
        scope: 'brand',
        polarity: 'replace',
        signalClass: 'visual_identity',
      },
    });

    const styleDial = snapshot?.candidates.find((candidate) => candidate.signalPath === 'motion.motionEnergy');
    expect(styleDial).toMatchObject({
      sourceField: 'editron.brand.visualStyle',
      trustLevel: 'manual_user_entry',
      learningWeight: {
        category: 'invented',
        service: 'editron',
        signalClass: 'motion_dial',
      },
    });

    const record = await store.getRecord(result.recordId);
    expect(record?.status).toBe('draft');
    expect(record?.review.required).toBe(true);
    expect(record?.profile.identity.brandName.value).toBe('Insturix');
    expect(record?.profile.palette.primary?.value).toBe('#101820');
    expect(record?.profile.typography.raw?.value).toBe('Space Grotesk, uppercase geometric sans');
    expect(record?.profile.voice.recurringPhrases.value).toContain('Direct, systems-led, anti-fluff.');
    expect(record?.profile.voice.recurringPhrases.trustLevel).toBe('manual_user_entry');
    expect(record?.profile.evidence.some((item) => item.extractor === 'editron-brand-settings-dual-write.v1')).toBe(true);
  });

  it('skips manual Editron brand updates when no supported fields changed', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const result = await writeEditronBrandSettingsToBrandVault({
      userId: 'user_editron',
      source: 'manual_brand_update',
      changedFields: [],
      now: '2026-06-24T03:05:00.000Z',
      store,
      brand: {
        brandId: 'brand_editron',
        userId: 'user_editron',
        name: 'Insturix',
      },
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'no_supported_updates' });
  });

  it('keeps Editron create and update routes wired to Brand Vault manual evidence staging', () => {
    const createRoute = readFileSync(new URL('../../app/api/services/editron/brands/route.ts', import.meta.url), 'utf8');
    const updateRoute = readFileSync(new URL('../../app/api/services/editron/brands/[brandId]/route.ts', import.meta.url), 'utf8');

    expect(createRoute).toContain('writeEditronBrandSettingsToBrandVault');
    expect(createRoute).toContain("source: 'manual_brand_create'");
    expect(createRoute).toContain('return NextResponse.json({ success: true, brand, vaultSync })');

    expect(updateRoute).toContain('writeEditronBrandSettingsToBrandVault');
    expect(updateRoute).toContain("source: 'manual_brand_update'");
    expect(updateRoute).toContain('changedFields: changedFieldNames');
    expect(updateRoute).toContain('return NextResponse.json({ success: true, brand: updated, vaultSync })');
  });
});
