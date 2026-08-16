import { describe, expect, it } from 'vitest';
import {
  admitClickatronCarouselPlan,
  CLICKATRON_CAROUSEL_MAX_SLIDES,
  CLICKATRON_CAROUSEL_MIN_SLIDES,
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

function carouselSpec(slideCount: number) {
  const base = singlePostSpec();
  return {
    ...base,
    kind: 'carousel',
    assetIntent: 'carousel',
    userIntent: {
      ...base.userIntent,
      wantsCarousel: true,
    },
    renderPlan: {
      ...base.renderPlan,
      textLayers: undefined,
      slides: Array.from({ length: slideCount }, (_, index) => ({
        id: `slide_${index + 1}`,
        index,
        sourceRefs: [`source_${index + 1}`],
        imagePrompt: `Complete visual prompt for carousel slide ${index + 1}.`,
      })),
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

  it('repairs missing model-authored asset intent from single-post kind with a warning', () => {
    const base = singlePostSpec();
    const spec = normalizeClickatronCreativeSpec({
      schemaVersion: base.schemaVersion,
      kind: base.kind,
      platform: base.platform,
      aspectRatio: base.aspectRatio,
      source: base.source,
      calendar: base.calendar,
      userIntent: base.userIntent,
      creativeBrief: base.creativeBrief,
      brand: base.brand,
      renderPlan: base.renderPlan,
      validation: base.validation,
    });

    expect(spec.assetIntent).toBe('post_graphic');
    expect(spec.validation.issues).toContainEqual(
      expect.objectContaining({
        code: 'asset_intent_defaulted',
        severity: 'warning',
      }),
    );
  });

  it('repairs blank model-authored asset intent from carousel kind', () => {
    const base = carouselSpec(2);
    const spec = normalizeClickatronCreativeSpec({
      ...base,
      assetIntent: '   ',
    });

    expect(spec.assetIntent).toBe('carousel');
    expect(spec.validation.issues?.some(issue => issue.code === 'asset_intent_defaulted')).toBe(true);
  });

  it('keeps rejecting unknown explicit asset intents', () => {
    expect(() =>
      normalizeClickatronCreativeSpec({
        ...singlePostSpec(),
        assetIntent: 'poster',
      }),
    ).toThrow(/assetIntent/);
  });

  it('repairs missing model-authored renderPlan text policy with a warning', () => {
    const base = singlePostSpec();
    const spec = normalizeClickatronCreativeSpec({
      ...base,
      renderPlan: {
        imagePrompt: base.renderPlan.imagePrompt,
        negativePrompt: base.renderPlan.negativePrompt,
        layoutIntent: base.renderPlan.layoutIntent,
        textLayers: base.renderPlan.textLayers,
      },
    });

    expect(spec.renderPlan.textPolicy).toBe('editable_text_layers');
    expect(spec.validation.issues).toContainEqual(
      expect.objectContaining({
        code: 'render_plan_text_policy_defaulted',
        severity: 'warning',
      }),
    );
  });

  it('repairs blank model-authored renderPlan text policy with the same default', () => {
    const spec = normalizeClickatronCreativeSpec({
      ...singlePostSpec(),
      renderPlan: {
        ...singlePostSpec().renderPlan,
        textPolicy: '   ',
      },
    });

    expect(spec.renderPlan.textPolicy).toBe('editable_text_layers');
    expect(spec.validation.issues?.some(issue => issue.code === 'render_plan_text_policy_defaulted')).toBe(true);
  });

  it('keeps rejecting unknown explicit renderPlan text policies', () => {
    expect(() =>
      normalizeClickatronCreativeSpec({
        ...singlePostSpec(),
        renderPlan: {
          ...singlePostSpec().renderPlan,
          textPolicy: 'editable',
        },
      }),
    ).toThrow(/renderPlan\.textPolicy/);
  });

  it('requires carousel specs to include between two and seven complete slide render plans', () => {
    const invalid = {
      ...carouselSpec(2),
      renderPlan: {
        ...singlePostSpec().renderPlan,
        slides: [],
      },
    };

    expect(() => normalizeClickatronCreativeSpec(invalid)).toThrow(/carousel specs require/i);
  });

  it('preserves source-ledger references on canonical carousel slides', () => {
    const spec = normalizeClickatronCreativeSpec(carouselSpec(2));

    expect(spec.renderPlan.slides?.map((slide) => slide.sourceRefs)).toEqual([
      ['source_1'],
      ['source_2'],
    ]);
  });

  it.each([
    ['one slide', carouselSpec(1)],
    ['eight slides', carouselSpec(8)],
    ['missing image prompt', {
      ...carouselSpec(2),
      renderPlan: {
        ...carouselSpec(2).renderPlan,
        slides: [
          carouselSpec(2).renderPlan.slides[0],
          { id: 'slide_2', index: 1 },
        ],
      },
    }],
    ['blank image prompt', {
      ...carouselSpec(2),
      renderPlan: {
        ...carouselSpec(2).renderPlan,
        slides: [
          carouselSpec(2).renderPlan.slides[0],
          { id: 'slide_2', index: 1, imagePrompt: '   ' },
        ],
      },
    }],
    ['non-contiguous indexes', {
      ...carouselSpec(2),
      renderPlan: {
        ...carouselSpec(2).renderPlan,
        slides: [
          carouselSpec(2).renderPlan.slides[0],
          { ...carouselSpec(2).renderPlan.slides[1], index: 2 },
        ],
      },
    }],
    ['duplicate slide ids', {
      ...carouselSpec(2),
      renderPlan: {
        ...carouselSpec(2).renderPlan,
        slides: [
          carouselSpec(2).renderPlan.slides[0],
          { ...carouselSpec(2).renderPlan.slides[1], id: 'slide_1' },
        ],
      },
    }],
  ])('rejects an incomplete canonical carousel plan: %s', (_label, invalid) => {
    expect(() => normalizeClickatronCreativeSpec(invalid)).toThrow();
  });

  it.each([CLICKATRON_CAROUSEL_MIN_SLIDES, CLICKATRON_CAROUSEL_MAX_SLIDES])(
    'admits the valid %i-slide boundary without padding or truncation',
    (slideCount) => {
      const slides = admitClickatronCarouselPlan({
        creativeSpec: carouselSpec(slideCount),
        requestedSlideCount: slideCount,
      });

      expect(slides).toHaveLength(slideCount);
      expect(slides.map((slide) => slide.index)).toEqual(
        Array.from({ length: slideCount }, (_, index) => index),
      );
    },
  );

  it('rejects requested carousel count mismatches at admission', () => {
    expect(() => admitClickatronCarouselPlan({
      creativeSpec: carouselSpec(3),
      requestedSlideCount: 5,
    })).toThrow(/Requested 5 carousel slides.*contains 3/);
  });

  it('preserves single-post admission behavior even when a slide count is present', () => {
    expect(admitClickatronCarouselPlan({
      creativeSpec: singlePostSpec(),
      requestedSlideCount: 7,
    })).toEqual([]);
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

  it('preserves a derived visualLanguage through normalization [P2]', () => {
    const spec = normalizeClickatronCreativeSpec({
      ...singlePostSpec(),
      visualLanguage: {
        vibe: ['urgent', 'sober'],
        imageStyle: ['editorial photo'],
        paletteTemperature: 'cool',
        confidence: 0.75,
        lowConfidenceFields: ['visualMode'],
        rationale: ['why'],
        derived: true,
      },
    });
    expect(spec.visualLanguage).toBeDefined();
    expect(spec.visualLanguage?.vibe).toEqual(['urgent', 'sober']);
    expect(spec.visualLanguage?.paletteTemperature).toBe('cool');
    expect(spec.visualLanguage?.confidence).toBe(0.75);
    expect(spec.visualLanguage?.derived).toBe(true);
  });

  it('fail-soft normalizes a malformed visualLanguage (clamps confidence, defaults palette)', () => {
    const spec = normalizeClickatronCreativeSpec({
      ...singlePostSpec(),
      visualLanguage: { vibe: ['x', 42, ''], paletteTemperature: 'chartreuse', confidence: 9 },
    });
    expect(spec.visualLanguage?.vibe).toEqual(['x']); // non-strings/blank dropped
    expect(spec.visualLanguage?.paletteTemperature).toBe('neutral'); // unknown → neutral
    expect(spec.visualLanguage?.confidence).toBe(1); // clamped to [0,1]
  });

  it('a spec without visualLanguage stays valid (backward compatible)', () => {
    const spec = normalizeClickatronCreativeSpec(singlePostSpec());
    expect(spec.visualLanguage).toBeUndefined();
  });
});
