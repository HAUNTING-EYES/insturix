import { describe, expect, it } from "vitest";
import {
  buildThinkToClickContext,
  findClickatronCreativeSpecInBlocks,
  normalizeRequestedCarouselSlideCount,
  pickThinkForgeProjectMeta,
} from "@/lib/thinkforge/clickatron-context";
import { mergeThinkForgeProjectMetadata } from "@/lib/thinkforge/state/types";
import type { ClickatronCreativeSpec } from "@/lib/thinkforge/schemas/clickatron-creative-contract";
import type { ThinkForgeBlock } from "@/lib/thinkforge/schemas/thinkforge-block";
import { parseMarkdownToBlocks } from "@/lib/thinkforge/normalization/markdown-parser";
import { renderThinkForgePostCarouselDocument } from "@/lib/thinkforge/schemas/post-carousel-deck";

describe("ThinkForge to Clickatron context", () => {
  it("preserves BrandVault and project-link provenance for Clickatron", () => {
    const context = buildThinkToClickContext({
      sessionId: "tf_session_123",
      scriptId: "script_456",
      projectId: "editron_project_789",
      title: "Launch Video",
      aspectRatio: "16:9",
      scenesCount: 4,
      projectMeta: {
        brandId: "brand_current",
        brandBrief: "Use the uploaded logo only. Keep copy terse.",
        campaignId: "campaign_launch",
        calendarItemId: "calendar_launch",
        contentCardId: "card_launch",
        idea: "Launch the new product",
        platform: "YouTube",
        preferences: { doNotLeak: true },
      },
      projectLink: {
        universalId: "plink_abc",
        brandId: "brand_stale",
        sourceScriptId: "script_from_link",
      },
    });

    expect(context).toMatchObject({
      sourceService: "thinkforge",
      sourceSessionId: "tf_session_123",
      sourceScriptId: "script_456",
      universalId: "plink_abc",
      brandId: "brand_current",
      projectId: "editron_project_789",
    });
    expect(context.metadata.sourceContext).toMatchObject({
      sourceService: "thinkforge",
      universalId: "plink_abc",
      brandId: "brand_current",
    });
    expect(context.metadata.thinkforge).toMatchObject({
      sessionId: "tf_session_123",
      scriptId: "script_456",
      projectMeta: {
        brandId: "brand_current",
        brandBrief: "Use the uploaded logo only. Keep copy terse.",
        campaignId: "campaign_launch",
        calendarItemId: "calendar_launch",
        contentCardId: "card_launch",
        idea: "Launch the new product",
        platform: "YouTube",
      },
    });
    expect(JSON.stringify(context.metadata)).not.toContain("doNotLeak");
  });

  it("fails loudly when session context is missing", () => {
    expect(() => buildThinkToClickContext({ sessionId: "   " })).toThrow(
      "ThinkForge sessionId is required",
    );
  });

  it("picks only the project metadata that should cross service boundaries", () => {
    expect(
      pickThinkForgeProjectMeta({
        brandId: "brand_1",
        brandBrief: "Brand rules",
        clientId: "client_1",
        clientName: "Acme",
        campaignId: "campaign_1",
        campaignName: "Launch Month",
        seriesId: "series_1",
        calendarItemId: "calendar_1",
        contentCardId: "card_1",
        preferences: { internal: true },
      }),
    ).toEqual({
      brandId: "brand_1",
      brandBrief: "Brand rules",
      clientId: "client_1",
      clientName: "Acme",
      campaignId: "campaign_1",
      campaignName: "Launch Month",
      seriesId: "series_1",
      calendarItemId: "calendar_1",
      contentCardId: "card_1",
    });
  });

  it("preserves ThinkForge source metadata when chat sends a thin project payload", () => {
    const merged = mergeThinkForgeProjectMetadata(
      {
        brandId: "brand_session",
        brandBrief: "Use the yellow-black visual system. Avoid hype words.",
        campaignId: "campaign_1",
        calendarItemId: "calendar_1",
        seriesId: "series_1",
        idea: "Original idea",
        platform: "LinkedIn",
      },
      {
        idea: "Updated idea for the current generation",
        platform: "Instagram",
        brandId: "   ",
      },
      { density: "compact" },
    );

    expect(merged).toMatchObject({
      brandId: "brand_session",
      brandBrief: "Use the yellow-black visual system. Avoid hype words.",
      campaignId: "campaign_1",
      calendarItemId: "calendar_1",
      seriesId: "series_1",
      idea: "Updated idea for the current generation",
      platform: "Instagram",
      preferences: { density: "compact" },
    });
  });

  it("allows explicit non-empty request metadata to override stored source metadata", () => {
    const merged = mergeThinkForgeProjectMetadata(
      {
        brandId: "brand_session",
        campaignId: "campaign_old",
      },
      {
        brandId: "brand_request",
        campaignId: "campaign_new",
      },
    );

    expect(merged.brandId).toBe("brand_request");
    expect(merged.campaignId).toBe("campaign_new");
  });

  it("feeds preserved chat metadata into Clickatron handoff context", () => {
    const projectMeta = mergeThinkForgeProjectMetadata(
      {
        brandId: "brand_session",
        brandBrief: "Use approved product marks only.",
        campaignId: "campaign_1",
        calendarItemId: "calendar_1",
        idea: "Approval ops carousel",
        platform: "LinkedIn",
      },
      {
        idea: "Approval ops carousel v2",
      },
    );

    const context = buildThinkToClickContext({
      sessionId: "tf_session_1",
      projectMeta,
      creativeSpec: {
        schemaVersion: 1,
        kind: "single_post_visual",
        assetIntent: "post_graphic",
        platform: "linkedin",
        aspectRatio: "1.91:1",
        source: {
          sourceService: "thinkforge",
          sourceBlockIds: ["block_1"],
        },
        userIntent: {
          visualMode: "text_forward_graphic",
          wantsCarousel: false,
        },
        creativeBrief: {
          objective: "educate agency founders",
          coreMessage: "one approval owner reduces drag",
        },
        renderPlan: {
          textPolicy: "editable_text_layers",
          imagePrompt: "A clean LinkedIn graphic showing three approval lanes converging into one owner lane.",
          textLayers: [
            {
              id: "headline",
              text: "One owner cuts approval drag",
              role: "headline",
              priority: 90,
              sourceBlockId: "block_1",
            },
          ],
        },
        validation: {
          status: "ready",
        },
      },
    });

    expect(context.brandId).toBe("brand_session");
    expect(context.metadata.thinkforge).toMatchObject({
      projectMeta: {
        brandId: "brand_session",
        brandBrief: "Use approved product marks only.",
        campaignId: "campaign_1",
        calendarItemId: "calendar_1",
        idea: "Approval ops carousel v2",
      },
    });
  });

  it("does NOT leak ThinkForge signalTrace into the client handoff metadata", () => {
    const signalTrace = {
      outputFormat: "linkedin_carousel",
      platform: "linkedin",
      selectedIntent: {
        goal: "turn market news into a brand-safe carousel",
        forbiddenTerms: ["game-changing"],
      },
      enforcedConstraints: ["Use editable text layers for visible copy"],
    };

    const context = buildThinkToClickContext({
      sessionId: "tf_session_trace",
      scriptId: "script_trace",
      projectMeta: {
        brandId: "brand_trace",
        platform: "LinkedIn",
      },
      signalTrace,
      creativeSpec: {
        schemaVersion: 1,
        kind: "carousel",
        assetIntent: "carousel",
        platform: "linkedin",
        aspectRatio: "1:1",
        source: {
          sourceService: "thinkforge",
          sourceBlockIds: ["block_trace"],
        },
        userIntent: {
          visualMode: "text_forward_graphic",
          wantsCarousel: true,
        },
        creativeBrief: {
          objective: "educate agency founders",
          coreMessage: "market events can become planned content",
        },
        renderPlan: {
          textPolicy: "editable_text_layers",
          imagePrompt: "Carousel cover about turning market events into scheduled brand content.",
          slides: [
            {
              id: "slide_1",
              index: 0,
              title: "Market moment",
              imagePrompt: "Slide one introduces the market event and why agencies should react.",
            },
            {
              id: "slide_2",
              index: 1,
              title: "Planned response",
              imagePrompt: "Slide two shows the market event becoming scheduled brand content.",
            },
          ],
        },
        validation: {
          status: "ready",
        },
      },
    });

    // signalTrace is internal signal-profile reasoning. It is intentionally NOT echoed to the
    // client handoff (65059c7e) — Clickatron consumes the distilled creativeSpec/keyClaims/
    // hardConstraints (persisted server-side) instead. Assert the raw trace does not leak.
    expect((context.metadata.thinkforge as Record<string, unknown>).signalTrace).toBeUndefined();
    expect((context.sessionDraft?.metadata.thinkforge as Record<string, unknown> | undefined)?.signalTrace).toBeUndefined();
    expect(JSON.stringify(context.metadata)).not.toContain("turn market news into a brand-safe carousel");
  });

  it("carries only safe document provenance and rejects a cross-brand snapshot", () => {
    const authoringContextSnapshot = {
      version: 1,
      resolvedAt: "2026-08-12T00:00:00.000Z",
      scope: { kind: "organization", brandId: "brand_trace" },
      brand: {
        brandId: "brand_trace",
        recordId: "brand_record_12",
        profileUpdatedAt: "2026-08-11T12:00:00.000Z",
        profileFingerprint: "abc123",
      },
      retrieval: {
        projectFactIds: ["fact_private"],
        globalFactIds: ["fact_global"],
        interactionPatternTypes: ["preferred_hook"],
      },
      writingKnowledgeVersion: "writing-knowledge-v3",
    };
    const context = buildThinkToClickContext({
      sessionId: "tf_session_provenance",
      projectMeta: { brandId: "brand_trace" },
      authoringContextSnapshot,
    });
    const thinkforge = context.metadata.thinkforge as Record<string, unknown>;

    expect(thinkforge.authoringProvenance).toEqual({
      version: 1,
      resolvedAt: "2026-08-12T00:00:00.000Z",
      brand: {
        brandId: "brand_trace",
        recordId: "brand_record_12",
        profileUpdatedAt: "2026-08-11T12:00:00.000Z",
        profileFingerprint: "abc123",
      },
      writingKnowledgeVersion: "writing-knowledge-v3",
    });
    expect(JSON.stringify(context.metadata)).not.toContain("fact_private");
    expect(JSON.stringify(context.metadata)).not.toContain("preferred_hook");

    expect(() => buildThinkToClickContext({
      sessionId: "tf_session_wrong_brand",
      projectMeta: { brandId: "brand_trace" },
      authoringContextSnapshot: {
        brand: { brandId: "brand_other", recordId: "brand_record_other" },
      },
    })).toThrow("document provenance does not match the session's bound brand");
  });

  it("fails closed for hidden carousel sidecars without a complete slide plan", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_cover",
        kind: "paragraph",
        content: [{ type: "text", text: "Your approval queue is not a workflow. It is a waiting room.", styles: {} }],
        exportMeta: {
          clickatron: {
            schemaVersion: 1,
            kind: "carousel",
            assetIntent: "carousel",
            platform: "linkedin",
            aspectRatio: "4:5",
            source: {
              sourceService: "thinkforge",
              sourceBlockIds: ["blk_cover"],
            },
            userIntent: {
              visualMode: "text_forward_graphic",
              wantsCarousel: true,
            },
            creativeBrief: {
              objective: "turn approval friction into a carousel",
              coreMessage: "approval queues need one owner",
            },
            renderPlan: {
              textPolicy: "editable_text_layers",
              imagePrompt: "Editorial carousel system with queue cards collapsing into one owner lane.",
              slides: [],
            },
            validation: {
              status: "ready",
            },
          },
        },
      },
      {
        id: "blk_payoff",
        kind: "paragraph",
        content: [{ type: "text", text: "Give every asset one final owner before production starts.", styles: {} }],
      },
    ];

    expect(() => findClickatronCreativeSpecInBlocks(blocks)).toThrow(
      /between 2 and 10 complete renderPlan\.slides/i,
    );
  });
  it("derives a non-sendable carousel draft from visible blocks without putting exact copy in the raster prompt", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_hook",
        kind: "paragraph",
        content: [{ type: "text", text: "Your brand team just hit 500 video requests for Q3.", styles: {} }],
      },
      {
        id: "blk_link",
        kind: "paragraph",
        content: [
          {
            type: "link",
            href: "https://example.com",
            content: [{ type: "text", text: "Bridge the 10x production gap without burnout.", styles: {} }],
          },
        ],
      },
    ];
    const signalTrace = {
      outputFormat: "linkedin_carousel",
      platform: "linkedin",
      selectedIntent: { goal: "turn a post into a Clickatron carousel" },
    };

    const context = buildThinkToClickContext({
      sessionId: "tf_session_visible",
      scriptId: "script_visible",
      title: "Scaling Video Post",
      blocks,
      signalTrace,
      projectMeta: {
        brandId: "brand_visible",
        campaignId: "campaign_visible",
      },
      userVisualChoices: {
        kind: "carousel",
        platform: "linkedin",
        aspectRatio: "4:5",
        visualMode: "text_forward_graphic",
        textDensity: "medium",
        vibe: "urgent but sober",
        imageStyle: "editorial collage",
      },
    });

    const spec = (context.metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;

    expect(spec.kind).toBe("carousel");
    expect(spec.platform).toBe("linkedin");
    expect(spec.aspectRatio).toBe("4:5");
    expect(spec.validation.status).toBe("needs_user_input");
    expect(spec.validation.issues).toEqual([
      expect.objectContaining({ code: "derived_from_visible_content" }),
    ]);
    expect(context.sessionDraft?.readyToGenerate).toBe(false);
    expect(context.sessionDraft?.validation.needsUserInput).toEqual([
      "Review and confirm the derived visual brief before sending to Clickatron.",
    ]);
    expect(spec.renderPlan.textPolicy).toBe("editable_text_layers");
    expect(spec.renderPlan.imagePrompt).toContain("Image style: editorial collage");
    expect(spec.renderPlan.imagePrompt).toContain("Concept keywords to interpret, not draw as text");
    expect(spec.renderPlan.slides).toHaveLength(2);
    expect(spec.renderPlan.slides?.[0].textLayers?.[0]).toMatchObject({
      text: "Your brand team just hit 500 video requests for Q3.",
      sourceBlockId: "blk_hook",
      locked: true,
    });
    expect(spec.renderPlan.slides?.[1].textLayers?.[0]?.text).toBe("Bridge the 10x production gap without burnout.");
    expect(context.sessionDraft?.prompt).toContain("Text rendering policy: do not rasterize readable text");
    expect(context.sessionDraft?.prompt).not.toContain("Your brand team just hit 500 video requests for Q3.");
    expect(context.sessionDraft?.prompt).not.toContain("Bridge the 10x production gap without burnout.");
    // signalTrace intentionally not echoed to the client handoff (65059c7e).
    expect((context.metadata.thinkforge as Record<string, unknown>).signalTrace).toBeUndefined();
  });

  it("uses the persisted document contract for writer handoff until the user explicitly overrides it", () => {
    const blocks: ThinkForgeBlock[] = Array.from({ length: 6 }, (_, index) => ({
      id: `blk_carousel_${index + 1}`,
      kind: "paragraph",
      content: [{ type: "text", text: `Carousel slide ${index + 1} copy`, styles: {} }],
    }));
    const input = {
      sessionId: "tf_instagram_carousel",
      scriptId: "script_instagram_carousel",
      title: "Brand consistency carousel",
      blocks,
      projectMeta: {
        platform: "Instagram",
        contentContract: {
          version: 1,
          documentKind: "post" as const,
          outputKind: "carousel" as const,
          artifactType: "carousel_deck" as const,
        },
      },
      writerOutput: {
        writerType: "post",
        writerMetadata: { platform: "instagram" },
        visualPrompts: {
          carouselPrompts: Array.from(
            { length: 6 },
            (_, index) => `Detailed on-brand visual prompt for carousel slide ${index + 1}.`,
          ),
        },
      },
    };

    const automatic = buildThinkToClickContext(input);
    const automaticSpec = (automatic.metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;

    expect(automaticSpec).toMatchObject({
      kind: "carousel",
      platform: "instagram",
      aspectRatio: "4:5",
      assetIntent: "carousel",
    });
    expect(automaticSpec.renderPlan.slides).toHaveLength(6);
    expect(automatic.sessionDraft).toMatchObject({
      kind: "carousel",
      platform: "instagram",
      aspectRatio: "4:5",
    });

    const mismatched = buildThinkToClickContext({
      ...input,
      userVisualChoices: { slideCount: 3 },
    });
    const mismatchedSpec = (mismatched.metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;
    expect(mismatchedSpec.renderPlan.slides).toHaveLength(6);
    expect(mismatchedSpec.validation.status).toBe("needs_user_input");
    expect(mismatchedSpec.validation.issues).toContainEqual(
      expect.objectContaining({ code: "carousel_slide_count_mismatch" }),
    );
    expect(mismatched.sessionDraft?.readyToGenerate).toBe(false);
    expect(mismatchedSpec.validation.needsUserInput).toContain(
      "Use the canonical 6-slide plan, or regenerate the carousel for exactly 3 slides.",
    );

    const overridden = buildThinkToClickContext({
      ...input,
      userVisualChoices: {
        kind: "single_post_visual",
        platform: "linkedin",
        aspectRatio: "1:1",
      },
    });
    const overriddenSpec = (overridden.metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;

    expect(overriddenSpec).toMatchObject({
      kind: "single_post_visual",
      platform: "linkedin",
      aspectRatio: "1:1",
      assetIntent: "post_graphic",
    });
    expect(overriddenSpec.renderPlan.slides).toBeUndefined();
  });

  it("compiles canonical carousel copy and provenance into exact editable Clickatron slides", () => {
    const carouselDeck = {
      version: 1,
      slides: [
        {
          role: "hook" as const,
          headline: "Your approval queue is a waiting room",
          body: "Five channels create five versions of the truth.",
          sourceRefs: ["source_approval_a"],
          imagePrompt: "Five document lanes converging into one calm review desk, with generous headline safe space.",
        },
        {
          role: "cta" as const,
          headline: "Give every asset one final owner",
          body: "Name the decision-maker before production starts.",
          sourceRefs: ["source_approval_b"],
          imagePrompt: "One illuminated approval lane ending at a single accountable owner, with generous headline safe space.",
        },
      ],
    };
    const blocks = parseMarkdownToBlocks(renderThinkForgePostCarouselDocument(
      carouselDeck,
      "A short caption that remains outside the slide plan.",
    ));
    const context = buildThinkToClickContext({
      sessionId: "tf_canonical_carousel",
      blocks,
      projectMeta: {
        platform: "LinkedIn",
        contentContract: {
          version: 1,
          documentKind: "post",
          outputKind: "carousel",
          artifactType: "carousel_deck",
        },
      },
      writerOutput: {
        writerType: "post",
        writerMetadata: { platform: "linkedin" },
        visualPrompts: {
          carouselDeck,
          carouselPrompts: carouselDeck.slides.map((slide) => slide.imagePrompt),
        },
      },
    });
    const spec = (context.metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;

    expect(spec.validation.status).toBe("ready");
    expect(spec.renderPlan.slides).toHaveLength(2);
    expect(spec.renderPlan.slides?.[0]).toMatchObject({
      title: "Your approval queue is a waiting room",
      sourceRefs: ["source_approval_a"],
      textLayers: [
        { text: "Your approval queue is a waiting room", role: "hook", locked: true },
        { text: "Five channels create five versions of the truth.", role: "body", locked: true },
      ],
    });
    expect(spec.renderPlan.slides?.[1]).toMatchObject({
      sourceRefs: ["source_approval_b"],
      textLayers: [
        { text: "Give every asset one final owner", role: "cta" },
        { text: "Name the decision-maker before production starts.", role: "body" },
      ],
    });
    expect(spec.renderPlan.slides?.[0].textLayers?.some((layer) => layer.text === "Slide 1")).toBe(false);
    expect(spec.renderPlan.slides?.[0].sourceBlockIds?.length).toBeGreaterThanOrEqual(3);

    const singleVisual = buildThinkToClickContext({
      sessionId: "tf_canonical_carousel_single_override",
      blocks,
      writerOutput: {
        writerType: "post",
        visualPrompts: { carouselDeck },
      },
      userVisualChoices: { kind: "single_post_visual" },
    });
    expect(singleVisual.sessionDraft?.prompt).toContain(carouselDeck.slides[0].imagePrompt);
  });

  it("fails closed when a canonical carousel deck diverges from its document or legacy mirror", () => {
    const carouselDeck = {
      version: 1,
      slides: [
        { role: "hook" as const, headline: "First truth", sourceRefs: ["source_1"], imagePrompt: "Visual one with safe space." },
        { role: "proof" as const, headline: "Second truth", sourceRefs: ["source_2"], imagePrompt: "Visual two with safe space." },
      ],
    };
    const writerOutput = {
      writerType: "post",
      visualPrompts: { carouselDeck },
    };

    expect(() => buildThinkToClickContext({
      sessionId: "tf_tampered_carousel",
      blocks: parseMarkdownToBlocks("## Slide 1\n\n### Replaced copy\n\n## Slide 2\n\n### Second truth"),
      writerOutput,
      userVisualChoices: { kind: "carousel" },
    })).toThrow(/does not match the visible document at Slide 1/);

    expect(() => buildThinkToClickContext({
      sessionId: "tf_contradictory_carousel",
      blocks: parseMarkdownToBlocks(renderThinkForgePostCarouselDocument(carouselDeck, "")),
      writerOutput: {
        ...writerOutput,
        visualPrompts: {
          carouselDeck,
          carouselPrompts: ["Different prompt one", "Different prompt two"],
        },
      },
      userVisualChoices: { kind: "carousel" },
    })).toThrow(/prompt mirror contradicts the canonical carousel deck/);
  });

  it("does not re-author a carousel to satisfy a requested count", () => {
    const sourceSentences = [
      "Approval requests arrive in five channels.",
      "Owners lose the latest revision.",
      "Launch dates slip.",
      "A single review queue captures every decision.",
      "Each comment keeps its source.",
      "Teams ship with one approved version.",
    ];
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_problem",
        kind: "paragraph",
        content: [{ type: "text", text: sourceSentences.slice(0, 3).join(" "), styles: {} }],
      },
      {
        id: "blk_solution",
        kind: "paragraph",
        content: [{ type: "text", text: sourceSentences.slice(3).join(" "), styles: {} }],
      },
    ];

    const context = buildThinkToClickContext({
      sessionId: "tf_expand_carousel",
      blocks,
      writerOutput: {
        writerType: "post",
        visualPrompts: {
          carouselPrompts: [
            "Editorial visual system showing fragmented review channels.",
            "Editorial visual system showing one controlled approval lane.",
          ],
        },
      },
      userVisualChoices: { kind: "carousel", slideCount: 5 },
    });
    const spec = (context.metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;

    expect(spec.renderPlan.slides).toHaveLength(2);
    expect(spec.validation.status).toBe("needs_user_input");
    expect(spec.validation.issues).toContainEqual(
      expect.objectContaining({ code: "carousel_slide_count_mismatch" }),
    );
    expect(context.sessionDraft?.readyToGenerate).toBe(false);
  });

  it("rejects a one-slide derived carousel instead of admitting filler", () => {
    expect(() => buildThinkToClickContext({
      sessionId: "tf_thin_carousel",
      blocks: [{
        id: "blk_thin",
        kind: "paragraph",
        content: [{ type: "text", text: "One sourced claim only.", styles: {} }],
      }],
      writerOutput: {
        writerType: "post",
        visualPrompts: { singleImagePrompt: "A restrained editorial proof card." },
      },
      userVisualChoices: { kind: "carousel", slideCount: 5 },
    })).toThrow(/between 2 and 10 complete renderPlan\.slides/i);
  });

  it("rejects invalid carousel counts at the contract boundary", () => {
    expect(normalizeRequestedCarouselSlideCount(undefined)).toBeUndefined();
    expect(normalizeRequestedCarouselSlideCount("   ")).toBeUndefined();
    expect(normalizeRequestedCarouselSlideCount("3")).toBe(3);
    expect(normalizeRequestedCarouselSlideCount(10)).toBe(10);
    expect(() => normalizeRequestedCarouselSlideCount(1)).toThrow("between 2 and 10");
    expect(() => normalizeRequestedCarouselSlideCount(11)).toThrow("between 2 and 10");
    expect(() => normalizeRequestedCarouselSlideCount(3.5)).toThrow("between 2 and 10");
  });

  it("derives review-required carousel slides when writer output only has a single image prompt", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_hook",
        kind: "paragraph",
        content: [{ type: "text", text: "Ops teams lose launch weeks to scattered approvals.", styles: {} }],
      },
      {
        id: "blk_payoff",
        kind: "paragraph",
        content: [{ type: "text", text: "One approval owner turns feedback into a production lane.", styles: {} }],
      },
    ];

    const context = buildThinkToClickContext({
      sessionId: "tf_writer_single_prompt",
      scriptId: "script_writer_single_prompt",
      title: "Approval Ops Carousel",
      blocks,
      writerOutput: {
        writerType: "post",
        visualPrompts: {
          singleImagePrompt: "Editorial workflow graphic with connected approval lanes and document stacks.",
        },
      },
      userVisualChoices: {
        kind: "carousel",
        platform: "linkedin",
        aspectRatio: "4:5",
        visualMode: "text_forward_graphic",
        textDensity: "medium",
      },
    });

    const spec = (context.metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;

    expect(spec.kind).toBe("carousel");
    expect(spec.renderPlan.slides).toHaveLength(2);
    expect(spec.renderPlan.slides?.[0].imagePrompt).toContain("Editorial workflow graphic");
    expect(spec.renderPlan.slides?.[0].textLayers?.[0]).toMatchObject({
      text: "Ops teams lose launch weeks to scattered approvals.",
      sourceBlockId: "blk_hook",
      locked: true,
    });
    expect(spec.validation.status).toBe("needs_user_input");
    expect(spec.validation.issues).toEqual([
      expect.objectContaining({ code: "carousel_slides_derived_from_single_prompt" }),
    ]);
    expect(context.sessionDraft?.readyToGenerate).toBe(false);
    expect(context.sessionDraft?.validation.needsUserInput).toEqual([
      "Review the auto-composed carousel slides before sending.",
    ]);
  });

  it("does not turn script scene prompts into a sendable single-post Clickatron spec", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "scene_source",
        kind: "paragraph",
        content: [{ type: "text", text: "Scene 1: The Missed Future. A designer waits for renders while posts pile up.", styles: {} }],
      },
    ];

    const context = buildThinkToClickContext({
      sessionId: "tf_script_session",
      scriptId: "script_video",
      title: "The Missed Future",
      blocks,
      writerOutput: {
        writerType: "script",
        visualPrompts: {
          scenePrompts: ["Scene 1: A designer frustrated with file transfers. A video editor waiting for renders."],
        },
      },
      userVisualChoices: {
        kind: "single_post_visual",
        platform: "linkedin",
        aspectRatio: "1:1",
        visualMode: "text_forward_graphic",
        textDensity: "medium",
      },
    });

    const spec = (context.metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;

    expect(spec.kind).toBe("single_post_visual");
    expect(spec.validation.status).toBe("needs_user_input");
    expect(spec.validation.issues).toEqual([
      expect.objectContaining({ code: "script_scene_prompts_need_clickatron_target" }),
    ]);
    expect(context.sessionDraft?.readyToGenerate).toBe(false);
    expect(context.sessionDraft?.validation.needsUserInput).toEqual([
      "Confirm a static Clickatron visual or regenerate this as a post/carousel brief before sending.",
    ]);
  });
});
