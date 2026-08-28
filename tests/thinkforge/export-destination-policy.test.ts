import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveThinkForgeExportDestination } from '@/lib/thinkforge/export/export-destination-policy';
import { resolveThinkForgeShootKitAccess } from '@/lib/thinkforge/production/shoot-kit-access-policy';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

describe('ThinkForge export destination policy', () => {
  it.each([
    ['social post', createThinkForgeWriterContract('social_post')],
    ['carousel', createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 })],
  ])('routes a %s only to Clickatron', (_label, contract) => {
    expect(resolveThinkForgeExportDestination(contract, 'clickatron')).toMatchObject({ allowed: true });
    expect(resolveThinkForgeExportDestination(contract, 'editron')).toMatchObject({
      allowed: false,
      code: 'export-destination-incompatible',
      status: 409,
    });
  });

  it('routes a video script only to Editron', () => {
    const contract = createThinkForgeWriterContract('video_script');

    expect(resolveThinkForgeExportDestination(contract, 'editron')).toMatchObject({ allowed: true });
    expect(resolveThinkForgeExportDestination(contract, 'clickatron')).toMatchObject({
      allowed: false,
      code: 'export-destination-incompatible',
      status: 409,
    });
  });

  it('opens Shoot Kit only for a saved video-script contract', () => {
    expect(resolveThinkForgeShootKitAccess(createThinkForgeWriterContract('video_script'))).toMatchObject({
      allowed: true,
    });
    for (const contract of [
      createThinkForgeWriterContract('social_post'),
      createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }),
      {
        version: 1,
        documentKind: 'document',
        outputKind: 'written_document',
        artifactType: 'research_brief',
      },
    ]) {
      expect(resolveThinkForgeShootKitAccess(contract)).toMatchObject({
        allowed: false,
        code: 'shoot_kit_not_applicable',
      });
    }
    expect(resolveThinkForgeShootKitAccess(undefined)).toMatchObject({
      allowed: false,
      code: 'shoot_kit_document_contract_invalid',
      status: 422,
    });
  });

  it('blocks written documents and malformed legacy documents from both production destinations', () => {
    const writtenDocument = {
      version: 1,
      documentKind: 'document',
      outputKind: 'written_document',
      artifactType: 'research_brief',
    };

    expect(resolveThinkForgeExportDestination(writtenDocument, 'clickatron')).toMatchObject({
      allowed: false,
      code: 'export-destination-incompatible',
    });
    expect(resolveThinkForgeExportDestination(writtenDocument, 'editron')).toMatchObject({
      allowed: false,
      code: 'export-destination-incompatible',
    });
    expect(resolveThinkForgeExportDestination(undefined, 'clickatron')).toMatchObject({
      allowed: false,
      code: 'export-document-contract-invalid',
      status: 422,
    });
    expect(resolveThinkForgeExportDestination({ outputKind: 'video_script' }, 'editron')).toMatchObject({
      allowed: false,
      code: 'export-document-contract-invalid',
      status: 422,
    });
  });

  it('makes the scripting workspace consume the saved contract and exact document identity', () => {
    const source = readFileSync(
      new URL('../../components/dashboard/ThinkForge/StoryboardingMode.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('resolveThinkForgeExportDestination(script?.contentContract, "clickatron")');
    expect(source).toContain('resolveThinkForgeExportDestination(script?.contentContract, "editron")');
    expect(source).toContain('resolveThinkForgeShootKitAccess(script?.contentContract)');
    expect(source).toContain('const exportScriptId = scriptId || script?.scriptId || null;');
    expect(source).toContain('Boolean(script && sessionId && exportScriptId)');
    expect(source).toContain('}, [sessionId, exportScriptId]);');
    expect(source).toContain('disabled={!canExportToClickatron}');
    expect(source).toContain('disabled={!canExportToEditron}');
    expect(source).toContain('if (!canExportToClickatron) setShowClickatronDialog(false);');
    expect(source).toContain('if (!canExportToEditron) setShowExportDialog(false);');
    expect(source).toContain('if (!canOpenShootKit) setShowShootKit(false);');
    expect(source).toContain('{canOpenShootKit && (');
    expect(source).toContain('scriptId={loadedShootKitScriptId || undefined}');
    expect(source.match(/scriptId=\{exportScriptId \|\| undefined\}/g)).toHaveLength(2);
    expect(source).not.toContain('selectedIdea.format ===');
  });
});
