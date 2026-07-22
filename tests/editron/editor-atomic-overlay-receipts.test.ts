import { describe, expect, it } from "vitest";
import {
  ensureAtomicOverlayReceipt,
  ensureLiveAtomicOverlayReceipt,
  isAtomicOverlayReceiptCurrent,
  withAtomicOverlayUpdateReceipt,
  withEditorAtomicOverlayReceipt,
} from "../../components/editron/editor/version-7.0.0/utils/atomic-overlay-receipts";
import { buildAtomicMomentBundle } from "../../lib/editron/services/moment-bundle";
import { OverlayType, type CaptionOverlay, type MotionGraphicOverlay, type SoundOverlay, type TextOverlay } from "../../components/editron/editor/version-7.0.0/types";

describe("editor atomic overlay receipts", () => {
  it("stamps editor text overlays with geometry, typography, and text atoms", () => {
    const overlay: TextOverlay = {
      id: 10,
      type: OverlayType.TEXT,
      from: 30,
      durationInFrames: 90,
      row: 6,
      left: 120,
      top: 720,
      width: 900,
      height: 140,
      isDragging: false,
      rotation: 0,
      content: "One thing changed everything",
      styles: {
        opacity: 1,
        fontSize: "72",
        fontWeight: "800",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.45)",
        fontFamily: "Inter",
        fontStyle: "normal",
        textDecoration: "none",
        textAlign: "center",
      },
    };

    const stamped = withEditorAtomicOverlayReceipt(overlay, { source: "test-editor" }) as any;
    const receipt = stamped.metadata.atomicOverlayReceipt;

    expect(receipt.family).toBe("text");
    expect(receipt.observeMode).toBe(true);
    expect(stamped.metadata.atomicOverlayForm.version).toBe("overlay-atomic-form-v1");
    expect(receipt.form.version).toBe("overlay-atomic-form-v1");
    expect(receipt.form.text).toMatchObject({
      version: "atomic-text-form-v1",
      channel: "text",
      rawText: overlay.content,
      casing: "mixed",
      hierarchy: {
        role: "headline",
        level: 1,
      },
      typography: {
        fontSize: "72",
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "center",
      },
      composition: {
        flowDirection: "left-to-right",
        wrapUnit: "block",
        rowStrategy: "balanced-block",
        rowCapacity: 2,
        targetRowCount: 1,
      },
      colorPlan: {
        contrastMode: "light-on-dark",
        roles: {
          primary: "#ffffff",
          surface: "rgba(0,0,0,0.45)",
        },
      },
    });
    expect(receipt.form.text.glyphs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        index: 0,
        text: "One",
        role: "word",
        lineIndex: 0,
        visual: { scale: 1, fontRole: "primary", colorRole: "primary", highlightMode: "none" },
      }),
      expect.objectContaining({ index: 3, text: "everything", role: "word", lineIndex: 0 }),
    ]));
    expect(receipt.form.text.lines).toEqual([
      expect.objectContaining({ index: 0, text: overlay.content, wordCount: 4 }),
    ]);
    expect(receipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "content-channel", key: "overlay.family", value: "text" }),
      expect.objectContaining({ kind: "position-x", key: "overlay.x", value: 120 }),
      expect.objectContaining({ kind: "font-size", key: "text.font_size", value: "72" }),
      expect.objectContaining({ kind: "font-weight", key: "text.font_weight", value: "800" }),
      expect.objectContaining({ kind: "text-color", key: "text.color", value: "#ffffff" }),
      expect.objectContaining({ kind: "text-content", key: "content.text", value: overlay.content }),
      expect.objectContaining({ kind: "text-line-count", key: "text.line_count", value: 1 }),
      expect.objectContaining({ kind: "text-word-count", key: "text.word_count", value: 4 }),
      expect.objectContaining({ kind: "text-flow-direction", key: "text.flow_direction", value: "left-to-right" }),
      expect.objectContaining({ kind: "text-row-strategy", key: "text.row_strategy", value: "balanced-block" }),
      expect.objectContaining({ kind: "text-row-capacity", key: "text.row_capacity", value: 2 }),
      expect.objectContaining({ kind: "text-contrast-mode", key: "text.contrast_mode", value: "light-on-dark" }),
    ]));
  });

  it("stamps editor caption and sound overlays with caption words and media timing atoms", () => {
    const caption: CaptionOverlay = {
      id: 11,
      type: OverlayType.CAPTION,
      from: 60,
      durationInFrames: 45,
      row: 4,
      left: 96,
      top: 820,
      width: 1728,
      height: 160,
      isDragging: false,
      rotation: 0,
      captions: [{
        text: "changed everything",
        startMs: 0,
        endMs: 900,
        timestampMs: 0,
        confidence: 0.98,
        words: [
          { word: "changed", startMs: 0, endMs: 400, confidence: 0.99 },
          { word: "everything", startMs: 410, endMs: 900, confidence: 0.98, emphasis: { type: "keyword", source: "test" } },
        ],
      }],
      displayConfig: {
        mode: "phrase",
        wordsPerGroup: 2,
        maxWordsPerLine: 1,
        showPreviousWords: false,
        fadeOutPreviousWords: false,
        useSpringScale: true,
        springDamping: 10,
        springMass: 0.5,
      },
      styles: {
        fontFamily: "Inter",
        fontSize: "64",
        fontWeight: 800,
        color: "#ffffff",
        textAlign: "center",
        lineHeight: 1.1,
        backgroundColor: "transparent",
        highlight: {
          color: "#111111",
          backgroundColor: "#f5d547",
          scale: 1.12,
          effect: "box",
          animation: "scale",
        },
      },
    };
    const sound: SoundOverlay = {
      id: 12,
      type: OverlayType.SOUND,
      from: 60,
      durationInFrames: 30,
      row: 0,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      isDragging: false,
      rotation: 0,
      content: "https://cdn.example.com/hit.wav",
      src: "https://cdn.example.com/hit.wav",
      assetId: "sfx-hit-1",
      startFromSound: 12,
      playbackRate: 1.15,
      styles: { volume: 0.42 },
    };

    const stampedCaption = withEditorAtomicOverlayReceipt(caption, { source: "test-editor" }) as any;
    const stampedSound = withEditorAtomicOverlayReceipt(sound, { source: "test-editor" }) as any;

    expect(stampedCaption.metadata.atomicOverlayReceipt.family).toBe("caption");
    expect(stampedCaption.metadata.atomicOverlayForm.version).toBe("overlay-atomic-form-v1");
    expect(stampedCaption.metadata.atomicOverlayReceipt.form.text).toMatchObject({
      version: "atomic-text-form-v1",
      channel: "caption",
      rawText: "changed everything",
      display: {
        mode: "phrase",
        wordsPerGroup: 2,
        maxWordsPerLine: 1,
        showPreviousWords: false,
        fadeOutPreviousWords: false,
      },
      highlight: {
        color: "#111111",
        backgroundColor: "#f5d547",
        scale: 1.12,
        effect: "box",
        animation: "scale",
      },
      composition: {
        flowDirection: "left-to-right",
        wrapUnit: "word",
        rowStrategy: "timed-fill",
        rowCapacity: 1,
        targetRowCount: 2,
      },
      colorPlan: {
        contrastMode: "light-on-dark",
        roles: {
          primary: "#ffffff",
          accent: "#f5d547",
          contrast: "#111111",
        },
      },
    });
    expect(stampedCaption.metadata.atomicOverlayReceipt.form.text.glyphs).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 0, text: "changed", role: "word", startMs: 0, endMs: 400, confidence: 0.99, lineIndex: 0 }),
      expect.objectContaining({
        index: 1,
        text: "everything",
        role: "keyword",
        startMs: 410,
        endMs: 900,
        confidence: 0.98,
        lineIndex: 1,
        emphasis: { role: "keyword", source: "test" },
        visual: { scale: 1.22, fontRole: "accent", colorRole: "accent", highlightMode: "fill" },
      }),
    ]));
    expect(stampedCaption.metadata.atomicOverlayReceipt.form.text.lineBreaks).toEqual([0]);
    expect(stampedCaption.metadata.atomicOverlayReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "caption-word", key: "caption.word.0", value: "changed" }),
      expect.objectContaining({ kind: "caption-word", key: "caption.word.1", value: "everything", strength: 1 }),
      expect.objectContaining({ kind: "glyph-role", key: "caption.word.1.role", value: "keyword" }),
      expect.objectContaining({ kind: "glyph-start-ms", key: "caption.word.1.start_ms", value: 410 }),
      expect.objectContaining({ kind: "glyph-end-ms", key: "caption.word.1.end_ms", value: 900 }),
      expect.objectContaining({ kind: "glyph-confidence", key: "caption.word.1.confidence", value: 0.98 }),
      expect.objectContaining({ kind: "glyph-display-scale", key: "caption.word.1.display_scale", value: 1.22 }),
      expect.objectContaining({ kind: "glyph-font-role", key: "caption.word.1.font_role", value: "accent" }),
      expect.objectContaining({ kind: "glyph-color-role", key: "caption.word.1.color_role", value: "accent" }),
      expect.objectContaining({ kind: "glyph-highlight-mode", key: "caption.word.1.highlight_mode", value: "fill" }),
      expect.objectContaining({ kind: "emphasis-role", key: "caption.word.1.emphasis_type", value: "keyword" }),
      expect.objectContaining({ kind: "caption-mode", key: "caption.mode", value: "phrase" }),
      expect.objectContaining({ kind: "caption-max-words-per-line", key: "caption.max_words_per_line", value: 1 }),
      expect.objectContaining({ kind: "text-wrap-unit", key: "text.wrap_unit", value: "word" }),
      expect.objectContaining({ kind: "text-row-strategy", key: "text.row_strategy", value: "timed-fill" }),
      expect.objectContaining({ kind: "text-target-row-count", key: "text.target_row_count", value: 2 }),
      expect.objectContaining({ kind: "highlight-effect", key: "caption.highlight.effect", value: "box" }),
      expect.objectContaining({ kind: "font-family", key: "text.font_family", value: "Inter" }),
    ]));
    expect(stampedSound.metadata.atomicOverlayReceipt.family).toBe("sound");
    expect(stampedSound.metadata.atomicOverlayReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "media-source", key: "media.src", value: sound.src }),
      expect.objectContaining({ kind: "asset-id", key: "media.asset_id", value: "sfx-hit-1" }),
      expect.objectContaining({ kind: "media-start-frame", key: "media.start_frame", value: 12 }),
      expect.objectContaining({ kind: "playback-speed", key: "audio.playback_rate", value: 1.15 }),
      expect.objectContaining({ kind: "volume", key: "audio.volume", value: 0.42 }),
    ]));
    expect(isAtomicOverlayReceiptCurrent(stampedSound)).toBe(true);
    expect(isAtomicOverlayReceiptCurrent({ ...stampedSound, playbackRate: 0.9 })).toBe(false);
  });

  it("derives caption text color, font, and row atoms from signals plus brand theme inputs", () => {
    const caption: CaptionOverlay = {
      id: 13,
      type: OverlayType.CAPTION,
      from: 90,
      durationInFrames: 60,
      row: 4,
      left: 120,
      top: 760,
      width: 1680,
      height: 180,
      isDragging: false,
      rotation: 0,
      captions: [{
        text: "this one idea changed my life",
        startMs: 0,
        endMs: 1300,
        timestampMs: 0,
        confidence: 0.97,
        words: [
          { word: "this", startMs: 0, endMs: 160, confidence: 0.98 },
          { word: "one", startMs: 170, endMs: 320, confidence: 0.99, emphasis: { type: "keyword", source: "test" } },
          { word: "idea", startMs: 330, endMs: 520, confidence: 0.98 },
          { word: "changed", startMs: 540, endMs: 780, confidence: 0.97 },
          { word: "my", startMs: 790, endMs: 900, confidence: 0.96 },
          { word: "life", startMs: 920, endMs: 1300, confidence: 0.98, emphasis: { type: "keyword", source: "test" } },
        ],
      }],
      displayConfig: {
        mode: "phrase",
        wordsPerGroup: 6,
        maxWordsPerLine: 6,
        showPreviousWords: false,
        fadeOutPreviousWords: false,
      },
      styles: {
        fontFamily: "Inter",
        fontSize: "68",
        fontWeight: 800,
        color: "#ffffff",
        textAlign: "center",
        lineHeight: 1.05,
        backgroundColor: "transparent",
        highlight: {
          color: "#050505",
          backgroundColor: "#f5d547",
          scale: 1.16,
          effect: "box",
          animation: "scale",
        },
      },
    };

    const stampedCaption = withEditorAtomicOverlayReceipt(caption, {
      source: "theme-test",
      signals: {
        speech_energy: 0.92,
        emotional_arousal: 0.86,
        pacing_velocity: 0.9,
        visual_dependency: 0.8,
        warmth: 0.2,
        formality: -0.4,
      },
      brand: {
        accentColor: "#00ff00",
        headingFont: "Poppins",
        bodyFont: "Inter",
        monoFont: "JetBrains Mono",
      },
    }) as any;
    const receipt = stampedCaption.metadata.atomicOverlayReceipt;

    expect(receipt.form.text).toMatchObject({
      colorPlan: {
        roles: {
          accent: "#00ff00",
        },
      },
      fontPlan: {
        roles: {
          accent: "Poppins",
          mono: "JetBrains Mono",
          secondary: "Inter",
        },
      },
      composition: {
        rowStrategy: "timed-fill",
        rowCapacity: 3,
        targetRowCount: 2,
      },
    });
    expect(receipt.form.text.glyphs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: "one",
        role: "keyword",
        visual: expect.objectContaining({ fontRole: "accent", colorRole: "accent" }),
      }),
      expect.objectContaining({
        text: "life",
        role: "keyword",
        visual: expect.objectContaining({ fontRole: "accent", colorRole: "accent" }),
      }),
    ]));
    expect(receipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "theme-accent-color", key: "theme.color.accent", value: "#00ff00" }),
      expect.objectContaining({ kind: "theme-heading-font", key: "theme.font.heading", value: "Poppins" }),
      expect.objectContaining({ kind: "theme-body-font", key: "theme.font.body", value: "Inter" }),
      expect.objectContaining({ kind: "theme-mono-font", key: "theme.font.mono", value: "JetBrains Mono" }),
      expect.objectContaining({ kind: "text-row-capacity", key: "text.row_capacity", value: 3 }),
    ]));
  });

  it("uses visual pressure atoms to compact caption form without preserving style labels as the behavior", () => {
    const caption: CaptionOverlay = {
      id: 14,
      type: OverlayType.CAPTION,
      from: 120,
      durationInFrames: 54,
      row: 4,
      left: 100,
      top: 780,
      width: 1720,
      height: 170,
      isDragging: false,
      rotation: 0,
      captions: [{
        text: "this is the one thing",
        startMs: 0,
        endMs: 1200,
        timestampMs: 0,
        confidence: 0.98,
        words: [
          { word: "this", startMs: 0, endMs: 150, confidence: 0.98 },
          { word: "is", startMs: 160, endMs: 260, confidence: 0.98 },
          { word: "the", startMs: 270, endMs: 380, confidence: 0.98 },
          { word: "one", startMs: 390, endMs: 560, confidence: 0.99, emphasis: { type: "keyword", source: "test" } },
          { word: "thing", startMs: 580, endMs: 1200, confidence: 0.98, emphasis: { type: "keyword", source: "test" } },
        ],
      }],
      displayConfig: {
        mode: "instagram",
        wordsPerGroup: 6,
        maxWordsPerLine: 6,
        showPreviousWords: true,
        fadeOutPreviousWords: false,
      },
      styles: {
        fontFamily: "Inter",
        fontSize: "64",
        fontWeight: 800,
        color: "#ffffff",
        textAlign: "center",
        lineHeight: 1.05,
        backgroundColor: "transparent",
        highlight: {
          color: "#050505",
          backgroundColor: "#facc15",
          scale: 1.14,
          effect: "box",
          animation: "scale",
        },
      },
    };

    const stamped = withEditorAtomicOverlayReceipt(caption, {
      source: "vjepa-caption-form-test",
      signals: {
        speech_energy: 0.68,
        visual_text_coverage: 0.78,
        text_box_count: 2,
        visual_complexity: 0.72,
        face_present: true,
        negative_space_bottom: 0.05,
      },
    }) as any;
    const receipt = stamped.metadata.atomicOverlayReceipt;

    expect(receipt.form.text).toMatchObject({
      display: {
        mode: "phrase",
        wordsPerGroup: 3,
        maxWordsPerLine: 2,
        showPreviousWords: false,
        fadeOutPreviousWords: true,
      },
      composition: {
        rowStrategy: "timed-fill",
        rowCapacity: 2,
        targetRowCount: 2,
      },
    });
    expect(receipt.form.text.glyphs).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "the", lineIndex: 1 }),
      expect.objectContaining({ text: "thing", lineIndex: 2 }),
    ]));
    expect(receipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "caption-mode", key: "caption.mode", value: "instagram", source: "decision-param", strength: 0.72 }),
      expect.objectContaining({ kind: "caption-mode", key: "caption.mode", value: "phrase", source: "derived-signal", strength: 1 }),
      expect.objectContaining({ kind: "caption-words-per-group", key: "caption.words_per_group", value: 3, source: "derived-signal" }),
      expect.objectContaining({ kind: "caption-max-words-per-line", key: "caption.max_words_per_line", value: 2, source: "derived-signal" }),
      expect.objectContaining({ kind: "caption-fade-previous", key: "caption.fade_previous_words", value: true, source: "derived-signal" }),
    ]));
  });

  it("lets caption and text atoms consume atomic moment bundle metadata as live signal truth", () => {
    const bundle = buildAtomicMomentBundle({
      frame: 150,
      fps: 30,
      snapshot: {
        "speech.energy": 0.86,
        "speech.emotion_intensity": 0.84,
        "visual.significance": 0.72,
        "visual.text_coverage": 0.76,
        "visual.text_box_count": 3,
        "visual.complexity": 0.74,
        "visual.face_present": true,
        "visual.face_count": 1,
        "visual.eye_contact": true,
        "visual.negative_space.top": 0.18,
      },
    });
    const caption: CaptionOverlay & { metadata: Record<string, unknown> } = {
      id: 15,
      type: OverlayType.CAPTION,
      from: 150,
      durationInFrames: 48,
      row: 4,
      left: 110,
      top: 780,
      width: 1700,
      height: 170,
      isDragging: false,
      rotation: 0,
      metadata: {
        atomicMomentBundle: bundle,
      },
      captions: [{
        text: "this changed the whole game",
        startMs: 0,
        endMs: 1100,
        timestampMs: 0,
        confidence: 0.98,
        words: [
          { word: "this", startMs: 0, endMs: 140, confidence: 0.98 },
          { word: "changed", startMs: 150, endMs: 360, confidence: 0.98 },
          { word: "the", startMs: 370, endMs: 480, confidence: 0.98 },
          { word: "whole", startMs: 500, endMs: 720, confidence: 0.98, emphasis: { type: "keyword", source: "bundle-test" } },
          { word: "game", startMs: 740, endMs: 1100, confidence: 0.98, emphasis: { type: "keyword", source: "bundle-test" } },
        ],
      }],
      displayConfig: {
        mode: "instagram",
        wordsPerGroup: 6,
        maxWordsPerLine: 6,
        showPreviousWords: true,
        fadeOutPreviousWords: false,
      },
      styles: {
        fontFamily: "Inter",
        fontSize: "64",
        fontWeight: 800,
        color: "#ffffff",
        textAlign: "center",
        lineHeight: 1.05,
        backgroundColor: "transparent",
        highlight: {
          color: "#050505",
          backgroundColor: "#facc15",
          scale: 1.14,
          effect: "box",
          animation: "scale",
        },
      },
    };

    const stamped = withEditorAtomicOverlayReceipt(caption, { source: "moment-bundle-caption-test" }) as any;
    const receipt = stamped.metadata.atomicOverlayReceipt;

    expect(stamped.metadata.atomicMomentBundle).toBe(bundle);
    expect(receipt.visualContext).toMatchObject({
      facePresent: true,
      textBoxCount: 3,
      recommendedDensity: "restrained",
    });
    expect(receipt.form.text).toMatchObject({
      display: {
        mode: "phrase",
        wordsPerGroup: 3,
        maxWordsPerLine: 2,
        showPreviousWords: false,
        fadeOutPreviousWords: true,
      },
      composition: {
        rowStrategy: "timed-fill",
        rowCapacity: 2,
        targetRowCount: 2,
      },
    });
    expect(receipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "speech-energy", key: "audio.speech_energy", value: bundle.rhythm.speechPeak }),
      expect.objectContaining({ kind: "text-box-count", key: "visual.text_box_count", value: 3 }),
      expect.objectContaining({ kind: "caption-mode", key: "caption.mode", value: "phrase", source: "derived-signal" }),
      expect.objectContaining({ kind: "caption-max-words-per-line", key: "caption.max_words_per_line", value: 2, source: "derived-signal" }),
    ]));
  });

  it("ensures persisted overlays have one receipt without appending on every save", () => {
    const overlay: SoundOverlay = {
      id: 21,
      type: OverlayType.SOUND,
      from: 120,
      durationInFrames: 30,
      row: 0,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      isDragging: false,
      rotation: 0,
      content: "",
      assetId: "bgm-1",
      audioStartFrame: 90,
      audioEndFrame: 180,
      styles: { volume: 0.6 },
    };

    const firstSave = ensureAtomicOverlayReceipt(overlay, { source: "project-service-save" }) as any;
    const secondSave = ensureAtomicOverlayReceipt(firstSave, { source: "project-service-autosave" }) as any;

    expect(firstSave.metadata.atomicOverlayReceipt.family).toBe("sound");
    expect(firstSave.metadata.atomicOverlayReceipts).toHaveLength(1);
    expect(secondSave.metadata.atomicOverlayReceipts).toHaveLength(1);
    expect(secondSave.metadata.atomicOverlayReceipt.source).toBe("project-service-save");
    expect(secondSave.metadata.atomicOverlayReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "media-start-frame", key: "media.audio_start_frame", value: 90 }),
      expect.objectContaining({ kind: "end-frame", key: "media.audio_end_frame", value: 180 }),
    ]));
  });

  it("refreshes the latest receipt when an existing overlay is updated", () => {
    const overlay: TextOverlay = {
      id: 31,
      type: OverlayType.TEXT,
      from: 15,
      durationInFrames: 60,
      row: 2,
      left: 100,
      top: 100,
      width: 500,
      height: 120,
      isDragging: false,
      rotation: 0,
      content: "old line",
      styles: {
        opacity: 1,
        fontSize: "48",
        fontWeight: "600",
        color: "#ffffff",
        backgroundColor: "transparent",
        fontFamily: "Inter",
        fontStyle: "normal",
        textDecoration: "none",
      },
    };
    const initial = withEditorAtomicOverlayReceipt(overlay, { source: "initial-test" });
    const updated = withAtomicOverlayUpdateReceipt(initial, {
      from: 45,
      left: 320,
      content: "new line",
      styles: {
        fontSize: "72",
        color: "#ffcc00",
      },
    } as Partial<TextOverlay>, { source: "project-service-update-overlay" }) as any;

    expect(updated.from).toBe(45);
    expect(updated.left).toBe(320);
    expect(updated.styles.fontWeight).toBe("600");
    expect(updated.styles.fontSize).toBe("72");
    expect(updated.metadata.atomicOverlayReceipts).toHaveLength(2);
    expect(updated.metadata.atomicOverlayReceipt.source).toBe("project-service-update-overlay");
    expect(updated.metadata.atomicOverlayReceipt.frame).toBe(45);
    expect(updated.metadata.atomicOverlayReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "position-x", key: "overlay.x", value: 320 }),
      expect.objectContaining({ kind: "font-size", key: "text.font_size", value: "72" }),
      expect.objectContaining({ kind: "text-color", key: "text.color", value: "#ffcc00" }),
      expect.objectContaining({ kind: "text-content", key: "content.text", value: "new line" }),
    ]));
  });

  it("detects and refreshes stale live editor receipts before persistence", () => {
    const overlay: TextOverlay = {
      id: 41,
      type: OverlayType.TEXT,
      from: 10,
      durationInFrames: 45,
      row: 3,
      left: 80,
      top: 180,
      width: 420,
      height: 90,
      isDragging: false,
      rotation: 0,
      content: "before",
      styles: {
        opacity: 1,
        fontSize: "40",
        fontWeight: "700",
        color: "#ffffff",
        backgroundColor: "transparent",
        fontFamily: "Inter",
        fontStyle: "normal",
        textDecoration: "none",
      },
    };
    const stamped = withEditorAtomicOverlayReceipt(overlay, { source: "initial-live-test" });
    const stale = {
      ...stamped,
      left: 640,
      content: "after",
      styles: {
        ...stamped.styles,
        fontSize: "56",
      },
    } as TextOverlay;

    expect(isAtomicOverlayReceiptCurrent(stale)).toBe(false);

    const refreshed = ensureLiveAtomicOverlayReceipt(stale, {
      source: "editor-set-overlays",
      appendReceipt: false,
    }) as any;

    expect(refreshed.metadata.atomicOverlayReceipt.source).toBe("editor-set-overlays");
    expect(refreshed.metadata.atomicOverlayReceipt.target.x).toBe(640);
    expect(refreshed.metadata.atomicOverlayReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "position-x", key: "overlay.x", value: 640 }),
      expect.objectContaining({ kind: "font-size", key: "text.font_size", value: "56" }),
      expect.objectContaining({ kind: "text-content", key: "content.text", value: "after" }),
    ]));
    expect(isAtomicOverlayReceiptCurrent(refreshed)).toBe(true);
  });

  it("treats persisted motion-graphic contentSignals as live receipt evidence", () => {
    const overlay = {
      id: 73,
      type: OverlayType.MOTION_GRAPHIC,
      from: 24,
      durationInFrames: 90,
      row: 7,
      left: 140,
      top: 240,
      width: 720,
      height: 280,
      isDragging: false,
      rotation: 0,
      structureType: "composition",
      content: { value: "82%", label: "retention" },
      resolvedTokens: {},
      contentSignals: {
        formality: 0.34,
        enthusiasm: 0.82,
        warmth: 0.58,
        emotional_arousal: 0.74,
        pacing_velocity: 0.69,
        humor: 0.18,
        visceral_impact: 0.8,
        visual_dependency: 0.62,
        cinematic_moment: 0.82,
        narrative_pressure: 0.76,
        motion_intensity: 0.66,
        speech_energy: 0.88,
      },
      styles: {
        opacity: 1,
        backgroundColor: "transparent",
      },
      metadata: {
        sourceType: "edl",
        graphicType: "composition",
      },
    } as unknown as MotionGraphicOverlay;

    const stamped = ensureLiveAtomicOverlayReceipt(overlay, {
      source: "phase0-rendered-aesthetic-scoring",
      appendReceipt: false,
    }) as MotionGraphicOverlay & { metadata: { atomicOverlayReceipt: any } };

    expect(stamped.metadata.atomicOverlayReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "content-signal", key: "content_signal.cinematic_moment", value: 0.82 }),
      expect.objectContaining({ kind: "content-signal", key: "content_signal.narrative_pressure", value: 0.76 }),
      expect.objectContaining({ kind: "content-signal", key: "content_signal.motion_intensity", value: 0.66 }),
      expect.objectContaining({ kind: "motion-intensity", key: "visual.motion_intensity", value: 0.66 }),
    ]));
    expect(isAtomicOverlayReceiptCurrent(stamped)).toBe(true);

    const stale = {
      ...stamped,
      contentSignals: {
        ...(stamped as any).contentSignals,
        cinematic_moment: 0.24,
      },
    } as MotionGraphicOverlay;

    expect(isAtomicOverlayReceiptCurrent(stale)).toBe(false);

    const refreshed = ensureLiveAtomicOverlayReceipt(stale, {
      source: "phase0-rendered-aesthetic-scoring",
      appendReceipt: false,
    }) as MotionGraphicOverlay & { metadata: { atomicOverlayReceipt: any } };

    expect(refreshed.metadata.atomicOverlayReceipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "content-signal", key: "content_signal.cinematic_moment", value: 0.24 }),
    ]));
    expect(isAtomicOverlayReceiptCurrent(refreshed)).toBe(true);
  });
});
