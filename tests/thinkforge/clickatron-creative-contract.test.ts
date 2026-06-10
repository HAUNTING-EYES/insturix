import { describe, expect, it } from 'vitest';
import {
  CLICKATRON_CREATIVE_SPEC_VERSION,
  normalizeClickatronCreativeSpec,
} from '../../lib/thinkforge/schemas/clickatron-creative-contract';
import { validateThinkForgeBlocks } from '../../lib/thinkforge/schemas/thinkforge-block';

function singlePostSpec() {
  return {
    schemaVersion: CLICKATRON_CREATIVE_SPEC_VERSION,
    kind: 'single_post_visual',
    assetIntent: 'post_graphic',
    platform: 'linkedin',
    aspectRatio: '4:5',
    source: {
      sourceService: 'thinkforge',
      sourceSessionId: 'tf_session_1',
      sourceScriptId: 'script_1',
      sourceBlockIds: ['blk_intro'],
      contentHash: 'hash_1',
    },
    calendar: {
      contentCardId: 'card_1',
      campaignId: 'campaign_1',
    },
    userIntent: {
      visualMode: 'text_forward_graphic',
      tone: 'sharp but warm',
      textDensity: 'medium',
      wantsCarousel: false,
    },
    creativeBrief: {
      objective: 'Turn the core post into a polished social graphic.',
      coreMessage: 'Creative systems should preserve context across services.',
      audience: 'founders and operators',
      hook: 'Stop rewriting the same idea for every tool.',
      keyClaims: ['Context should travel with the content'],
      cta: 'Design this in Clickatron',
      visualMetaphor: 'a connected creative pipeline',
    },
    brand: {
      brandId: 'brand_1',
      brandSnapshotId: 'brand_snapshot_1',
      hardConstraints: ['Do not invent logo placement'],
      softPreferences: ['High contrast editorial layouts'],
    },
    renderPlan: {
      textPolicy: 'editable_text_layers',
      imagePrompt: 'Editorial social graphic with connected creative workflow nodes.',
      negativePrompt: 'misspelled words, fake logos, cluttered composition',
      layoutIntent: 'Strong headline at top, supporting visual below.',
      textLayers: [
        {
          id: 'txt_hook',
          text: 'Stop rewriting the same idea for every tool.',
          role: 'headline',
          priority: 100,
          sourceBlockId: 'blk_intro',
          maxLines: 2,
          locked: true,
        },
      ],
    },
    validation: {
      status: 'ready',
    },
  };
}

describe('Clickatron creative contract', () => {
  it('normalizes a single-post handoff with editable text separated from image prompt', () => {
    const spec = normalizeClickatronCreativeSpec(singlePostSpec());

    expect(spec.kind).toBe('single_post_visual');
    expect(spec.renderPlan.textPolicy).toBe('editable_text_layers');
    expect(spec.renderPlan.textLayers?.[0]?.text).toContain('Stop rewriting');
    expect(spec.renderPlan.imagePrompt).not.toContain('Stop rewriting');
    expect(spec.source.sourceBlockIds).toEqual(['blk_intro']);
    expect(spec.brand?.hardConstraints).toContain('Do not invent logo placement');
  });

  it('requires carousel specs to include slide render plans', () => {
    const invalid = {
      ...singlePostSpec(),
      kind: 'carousel',
      assetIntent: 'carousel',
      renderPlan: {
        ...singlePostSpec().renderPlan,
        slides: [],
      },
    };

    expect(() => normalizeClickatronCreativeSpec(invalid)).toThrow(/carousel specs require/i);
  });

  it('preserves export-only Clickatron metadata through ThinkForge block validation', () => {
    const [block] = validateThinkForgeBlocks([
      {
        id: 'blk_intro',
        kind: 'paragraph',
        content: [{ type: 'text', text: 'Visible post copy only.', styles: {} }],
        exportMeta: {
          clickatron: singlePostSpec(),
        },
      },
    ]);

    expect(block.content[0]?.text).toBe('Visible post copy only.');
    expect(block.exportMeta?.clickatron?.renderPlan.textLayers?.[0]?.role).toBe('headline');
    expect(JSON.stringify(block.content)).not.toContain('imagePrompt');
  });

  it('fails loudly for malformed hidden Clickatron metadata', () => {
    expect(() =>
      validateThinkForgeBlocks([
        {
          id: 'blk_intro',
          kind: 'paragraph',
          content: [{ type: 'text', text: 'Visible post copy only.', styles: {} }],
          exportMeta: {
            clickatron: {
              ...singlePostSpec(),
              schemaVersion: 999,
            },
          },
        },
      ]),
    ).toThrow(/schemaVersion/);
  });

  it('rejects non-ThinkForge source provenance', () => {
    expect(() =>
      normalizeClickatronCreativeSpec({
        ...singlePostSpec(),
        source: {
          ...singlePostSpec().source,
          sourceService: 'editron',
        },
      }),
    ).toThrow(/sourceService/);
  });
});
