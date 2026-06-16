import { describe, expect, it } from 'vitest';
import { thinkForgeBlocksToTiptapJSON } from '../../lib/thinkforge/mappers/thinkforge-to-tiptap';
import { tiptapJSONToThinkForgeBlocks } from '../../lib/thinkforge/mappers/tiptap-to-thinkforge';
import { CLICKATRON_CREATIVE_SPEC_VERSION } from '../../lib/thinkforge/schemas/clickatron-creative-contract';
import { validateThinkForgeBlocks, type ThinkForgeBlock } from '../../lib/thinkforge/schemas/thinkforge-block';
import { preserveExportMetaForUnchangedBlocks } from '../../lib/thinkforge/utils/preserve-export-meta';

function clickatronExportMeta(imagePrompt = 'Editorial graphic showing a connected creative workflow.') {
  return {
    clickatron: {
      schemaVersion: CLICKATRON_CREATIVE_SPEC_VERSION,
      kind: 'single_post_visual',
      assetIntent: 'post_graphic',
      platform: 'linkedin',
      aspectRatio: '4:5',
      source: {
        sourceService: 'thinkforge',
        sourceSessionId: 'tf_session_1',
        sourceScriptId: 'default',
        sourceBlockIds: ['blk_intro'],
        contentHash: 'hash_1',
      },
      userIntent: {
        visualMode: 'text_forward_graphic',
        tone: 'sharp but warm',
        textDensity: 'medium',
        wantsCarousel: false,
      },
      creativeBrief: {
        objective: 'Create a LinkedIn post graphic.',
        coreMessage: 'Creative handoffs should preserve hidden metadata.',
        audience: 'founders',
        hook: 'Stop losing the brief at the service boundary.',
        keyClaims: ['Hidden handoff metadata must survive editor saves'],
        cta: 'Send it to Clickatron',
        visualMetaphor: 'a document connected to a design canvas',
      },
      renderPlan: {
        textPolicy: 'editable_text_layers',
        imagePrompt,
        layoutIntent: 'Headline-led social graphic with one supporting visual.',
      },
      validation: {
        status: 'ready',
      },
    },
  };
}

function block(text: string, exportMeta?: ReturnType<typeof clickatronExportMeta>): ThinkForgeBlock {
  const [validated] = validateThinkForgeBlocks([
    {
      id: 'blk_intro',
      kind: 'paragraph',
      content: [{ type: 'text', text, styles: {} }],
      ...(exportMeta ? { exportMeta } : {}),
    },
  ]);
  return validated;
}

describe('preserveExportMetaForUnchangedBlocks', () => {
  it('restores Clickatron export metadata lost by the Tiptap editor conversion', () => {
    const existing = [block('Visible post copy only.', clickatronExportMeta())];
    const richText = thinkForgeBlocksToTiptapJSON(existing);
    const editorRoundTripBlocks = tiptapJSONToThinkForgeBlocks(richText);

    expect(editorRoundTripBlocks[0]?.exportMeta).toBeUndefined();

    const merged = preserveExportMetaForUnchangedBlocks(editorRoundTripBlocks, existing);

    expect(merged[0]?.exportMeta?.clickatron?.renderPlan.imagePrompt).toBe(
      'Editorial graphic showing a connected creative workflow.',
    );
  });

  it('does not preserve export metadata after visible copy changes', () => {
    const existing = [block('Visible post copy only.', clickatronExportMeta())];
    const incoming = [block('Edited visible post copy.')];

    const merged = preserveExportMetaForUnchangedBlocks(incoming, existing);

    expect(merged[0]?.exportMeta).toBeUndefined();
  });

  it('keeps incoming export metadata when the caller provides fresh metadata', () => {
    const existing = [block('Visible post copy only.', clickatronExportMeta('Old image prompt.'))];
    const incoming = [block('Visible post copy only.', clickatronExportMeta('Fresh image prompt.'))];

    const merged = preserveExportMetaForUnchangedBlocks(incoming, existing);

    expect(merged[0]?.exportMeta?.clickatron?.renderPlan.imagePrompt).toBe('Fresh image prompt.');
  });
});
