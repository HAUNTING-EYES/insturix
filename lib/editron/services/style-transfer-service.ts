/**
 * Style Transfer Service
 *
 * Extracts an "Edit DNA" style profile from a reference video using Gemini Vision,
 * and generates a plan to apply that style to an Editron project.
 */

import { nanoid } from "nanoid";
import { getDatabase, COLLECTIONS } from "../db/mongodb";
import { projectService } from "./project-service";
import { assetResolver } from "./asset-resolver";

/* ====================================================================== */
/*  Types                                                                  */
/* ====================================================================== */

export interface EditDNA {
  profileId: string;
  sourceName: string;
  sourceUrl?: string;
  sourceAssetId?: string;

  cutRhythm: {
    avgCutsPerMinute: number;
    pattern: "steady" | "fast-slow-fast" | "building" | "random";
    avgClipDuration: number; // seconds
  };
  transitions: {
    dominant: "hard_cut" | "fade" | "wipe" | "zoom_punch" | "slide";
    frequency: number; // percentage of cuts using transitions (0-100)
  };
  colorGrade: {
    temperature: "warm" | "cool" | "neutral";
    saturation: "high" | "normal" | "desaturated";
    contrast: "high" | "normal" | "low";
    dominantColors: string[];
  };
  textStyle: {
    fontWeight: "light" | "normal" | "bold" | "extra-bold";
    position: "center" | "lower_third" | "top" | "varied";
    animation: "fade" | "slide" | "pop" | "typewriter" | "none";
    frequency: "heavy" | "moderate" | "minimal";
  };
  musicStyle: {
    tempo: "slow" | "medium" | "fast";
    genre: string;
    energyLevel: "low" | "medium" | "high";
  };
  pacing: {
    overall: "slow" | "medium" | "fast";
    hookSpeed: "fast" | "medium";
    mainSpeed: "slow" | "medium" | "fast";
  };
  graphicsDensity: "heavy" | "moderate" | "minimal";
}

export interface StyleAction {
  type: "cut_rhythm" | "color_grade" | "text_style" | "music" | "graphics";
  description: string;
  aiChatPrompt: string;
}

export interface StyleApplicationPlan {
  actions: StyleAction[];
  summary: string;
}

/* ====================================================================== */
/*  MongoDB collection for style profiles                                  */
/* ====================================================================== */

const STYLE_PROFILES_COLLECTION = COLLECTIONS.STYLE_PROFILES;

async function saveProfile(userId: string, dna: EditDNA): Promise<void> {
  const db = await getDatabase();
  await db.collection(STYLE_PROFILES_COLLECTION).updateOne(
    { profileId: dna.profileId, userId },
    {
      $set: {
        ...dna,
        userId,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

export async function loadProfile(
  userId: string,
  profileId: string,
): Promise<EditDNA | null> {
  const db = await getDatabase();
  const doc = await db
    .collection(STYLE_PROFILES_COLLECTION)
    .findOne({ profileId, userId });
  if (!doc) return null;

  // Strip MongoDB fields
  const { _id, userId: _u, createdAt, updatedAt, ...rest } = doc;
  return rest as unknown as EditDNA;
}

export async function listProfiles(userId: string): Promise<EditDNA[]> {
  const db = await getDatabase();
  const docs = await db
    .collection(STYLE_PROFILES_COLLECTION)
    .find({ userId })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray();

  return docs.map((d) => {
    const { _id, userId: _u, createdAt, updatedAt, ...rest } = d;
    return rest as unknown as EditDNA;
  });
}

/* ====================================================================== */
/*  URL detection helpers                                                  */
/* ====================================================================== */

function isExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      /youtube\.com|youtu\.be/i.test(parsed.hostname) ||
      /instagram\.com/i.test(parsed.hostname) ||
      /tiktok\.com/i.test(parsed.hostname) ||
      /vimeo\.com/i.test(parsed.hostname)
    );
  } catch (err: unknown) { console.warn('[StyleTransfer] URL parse failed:', err instanceof Error ? err.message : err); return false; }
}

/* ====================================================================== */
/*  Frame sampling via Gemini File API                                     */
/* ====================================================================== */

/**
 * Build base64 frame samples from a GCS-hosted video asset.
 * We ask the asset resolver for a signed URL, then send it to Gemini as a
 * file-referenced video. Gemini Vision natively handles video and can sample
 * frames internally, so we don't need to extract frames ourselves — we just
 * pass the video URL and ask Gemini to analyze the editing style.
 */
async function resolveOwnedVideoAsset(
  assetId: string,
  userId: string,
): Promise<{ url: string; sourceName: string; assetId: string }> {
  const asset = await assetResolver.getAsset(assetId, userId);
  if (!asset) throw new Error(`Video asset ${assetId} was not found or is not owned by this user`);
  if (asset.type !== "video") {
    throw new Error(`Asset ${assetId} is not a video (type: ${asset.type})`);
  }

  const url = await assetResolver.resolveAssetUrl(assetId, userId);
  if (!url) throw new Error(`Could not resolve video asset ${assetId}`);

  return {
    url,
    sourceName: asset.filename || "Reference Video",
    assetId,
  };
}

async function resolveVideoOverlayTarget(
  overlayId: string,
  userId: string,
  projectId: string,
): Promise<{ url: string; sourceName: string; assetId: string }> {
  const project = await projectService.loadProject(userId, projectId);
  if (!project) throw new Error("Project not found");

  const overlay = (project.overlays || []).find(
    (o: any) => String(o.id) === String(overlayId),
  );
  if (!overlay) throw new Error(`Overlay ${overlayId} not found in project`);
  if (overlay.type !== "video")
    throw new Error(`Overlay ${overlayId} is not a video (type: ${overlay.type})`);

  const assetId = (overlay as any).assetId;
  if (!assetId) throw new Error("Video overlay has no assetId");
  return resolveOwnedVideoAsset(String(assetId), userId);
}

/* ====================================================================== */
/*  extractEditDNA                                                         */
/* ====================================================================== */

const EDIT_DNA_PROMPT = `<role>You are a professional video editor analyzing a reference video's editing style.</role>

<task>Analyze this video's editing style in detail across 7 dimensions and return structured JSON.</task>

<rules>
RULE 1 — Analyze these 7 dimensions:
  1. Cut rhythm: How often are there cuts? Average cuts per minute? Pattern (steady, building, fast-slow-fast, random)? Average clip duration in seconds?
  2. Transitions: Dominant type (hard cuts, fades, wipes, zoom punches, slides)? Percentage of cuts using visible transition effects vs hard cuts?
  3. Color grade: Temperature (warm/cool/neutral)? Saturation (high/normal/desaturated)? Contrast (high/normal/low)? 2-4 dominant hex colors?
  4. Text/graphics style: Font weight (light/normal/bold/extra-bold)? Position (center/lower_third/top/varied)? Animation (fade/slide/pop/typewriter/none)? Frequency (heavy/moderate/minimal)?
  5. Music style: Tempo (slow/medium/fast)? Genre? Energy level (low/medium/high)?
  6. Pacing: Overall (slow/medium/fast)? Hook speed (fast/medium)? Main content speed (slow/medium/fast)?
  7. Graphics density: Motion graphics, stickers, emojis, icons, decorative elements (heavy/moderate/minimal)?
RULE 2 — Return ONLY valid JSON, no markdown, no explanation.
</rules>

<output_format>
{
  "cutRhythm": {
    "avgCutsPerMinute": <number>,
    "pattern": "steady" | "fast-slow-fast" | "building" | "random",
    "avgClipDuration": <number in seconds>
  },
  "transitions": {
    "dominant": "hard_cut" | "fade" | "wipe" | "zoom_punch" | "slide",
    "frequency": <0-100 percentage>
  },
  "colorGrade": {
    "temperature": "warm" | "cool" | "neutral",
    "saturation": "high" | "normal" | "desaturated",
    "contrast": "high" | "normal" | "low",
    "dominantColors": ["#hex1", "#hex2", ...]
  },
  "textStyle": {
    "fontWeight": "light" | "normal" | "bold" | "extra-bold",
    "position": "center" | "lower_third" | "top" | "varied",
    "animation": "fade" | "slide" | "pop" | "typewriter" | "none",
    "frequency": "heavy" | "moderate" | "minimal"
  },
  "musicStyle": {
    "tempo": "slow" | "medium" | "fast",
    "genre": "<genre string>",
    "energyLevel": "low" | "medium" | "high"
  },
  "pacing": {
    "overall": "slow" | "medium" | "fast",
    "hookSpeed": "fast" | "medium",
    "mainSpeed": "slow" | "medium" | "fast"
  },
  "graphicsDensity": "heavy" | "moderate" | "minimal"
}
</output_format>`;

export async function extractEditDNA(params: {
  assetId?: string;
  videoOverlayId?: string;
  videoUrl?: string;
  sourceName?: string;
  userId: string;
  projectId?: string;
}): Promise<EditDNA> {
  const { assetId, videoOverlayId, videoUrl, sourceName, userId, projectId } = params;

  const providedTargets = [assetId, videoOverlayId, videoUrl].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  if (providedTargets.length !== 1) {
    throw new Error(
      "Provide exactly one reference target: assetId, videoOverlayId, or videoUrl",
    );
  }

  // If external URL, inform user they need to upload
  if (videoUrl && isExternalUrl(videoUrl)) {
    throw new Error(
      `The URL appears to be from a third-party platform (YouTube, Instagram, etc.). ` +
        `Due to copyright restrictions, we cannot download videos from external platforms. ` +
        `Please download the video yourself and upload it to Editron, then try again.`,
    );
  }

  // Resolve the video asset URL
  let resolvedUrl: string;
  let resolvedSourceName = sourceName;
  let resolvedAssetId: string | undefined;
  if (assetId) {
    const target = await resolveOwnedVideoAsset(assetId, userId);
    resolvedUrl = target.url;
    resolvedSourceName ||= target.sourceName;
    resolvedAssetId = target.assetId;
  } else if (videoOverlayId && projectId) {
    const target = await resolveVideoOverlayTarget(videoOverlayId, userId, projectId);
    resolvedUrl = target.url;
    resolvedSourceName ||= target.sourceName;
    resolvedAssetId = target.assetId;
  } else if (videoUrl) {
    resolvedUrl = videoUrl;
  } else {
    throw new Error("projectId is required when using videoOverlayId");
  }

  const { uploadReferenceVideoToGemini } = await import('./reference-content-extractor');
  const fileUri = await uploadReferenceVideoToGemini(resolvedUrl);

  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();

  const result = await model.generateContent([
    {
      fileData: {
        mimeType: "video/mp4",
        fileUri,
      },
    },
    { text: EDIT_DNA_PROMPT },
  ]);

  const responseText = result.response.text();

  // Parse the JSON response — Gemini sometimes wraps in markdown code blocks
  let parsed: any;
  try {
    const cleaned = responseText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    throw new Error(
      "Failed to parse style analysis from Gemini. The model returned an unexpected format.",
    );
  }

  // Build the EditDNA profile
  const profileId = `style_${nanoid(12)}`;
  const dna: EditDNA = {
    profileId,
    sourceName: resolvedSourceName || "Reference Video",
    sourceUrl: videoUrl || undefined,
    sourceAssetId: resolvedAssetId,

    cutRhythm: {
      avgCutsPerMinute: Number(parsed.cutRhythm?.avgCutsPerMinute) || 10,
      pattern: parsed.cutRhythm?.pattern || "steady",
      avgClipDuration: Number(parsed.cutRhythm?.avgClipDuration) || 3,
    },
    transitions: {
      dominant: parsed.transitions?.dominant || "hard_cut",
      frequency: Number(parsed.transitions?.frequency) || 0,
    },
    colorGrade: {
      temperature: parsed.colorGrade?.temperature || "neutral",
      saturation: parsed.colorGrade?.saturation || "normal",
      contrast: parsed.colorGrade?.contrast || "normal",
      dominantColors: Array.isArray(parsed.colorGrade?.dominantColors)
        ? parsed.colorGrade.dominantColors
        : [],
    },
    textStyle: {
      fontWeight: parsed.textStyle?.fontWeight || "normal",
      position: parsed.textStyle?.position || "center",
      animation: parsed.textStyle?.animation || "fade",
      frequency: parsed.textStyle?.frequency || "moderate",
    },
    musicStyle: {
      tempo: parsed.musicStyle?.tempo || "medium",
      genre: parsed.musicStyle?.genre || "unknown",
      energyLevel: parsed.musicStyle?.energyLevel || "medium",
    },
    pacing: {
      overall: parsed.pacing?.overall || "medium",
      hookSpeed: parsed.pacing?.hookSpeed || "fast",
      mainSpeed: parsed.pacing?.mainSpeed || "medium",
    },
    graphicsDensity: parsed.graphicsDensity || "moderate",
  };

  // Persist the profile
  await saveProfile(userId, dna);

  return dna;
}

/* ====================================================================== */
/*  applyEditDNA                                                           */
/* ====================================================================== */

export async function applyEditDNA(
  projectId: string,
  userId: string,
  dna: EditDNA,
): Promise<StyleApplicationPlan> {
  const project = await projectService.loadProject(userId, projectId);
  if (!project) throw new Error("Project not found");

  const fps = project.fps || 30;
  const overlays = project.overlays || [];
  const actions: StyleAction[] = [];

  // 1. Cut Rhythm — suggest trimming clips to match average clip duration
  const videoOverlays = overlays.filter((o: any) => o.type === "video");
  if (videoOverlays.length > 0) {
    const targetFrames = Math.round(dna.cutRhythm.avgClipDuration * fps);
    const longClips = videoOverlays.filter(
      (o: any) => (o.durationInFrames || 0) > targetFrames * 1.5,
    );

    if (longClips.length > 0) {
      actions.push({
        type: "cut_rhythm",
        description:
          `Match reference cut rhythm: ~${dna.cutRhythm.avgCutsPerMinute} cuts/min, ` +
          `${dna.cutRhythm.avgClipDuration}s avg clip duration (${dna.cutRhythm.pattern} pattern). ` +
          `${longClips.length} clip(s) are longer than the target.`,
        aiChatPrompt:
          `Trim all video clips to approximately ${dna.cutRhythm.avgClipDuration} seconds each ` +
          `to match a ${dna.cutRhythm.pattern} cut rhythm with ~${dna.cutRhythm.avgCutsPerMinute} cuts per minute. ` +
          `Split longer clips if needed.`,
      });
    }
  }

  // 2. Color Grade — describe the target grade (future: apply color overlay)
  actions.push({
    type: "color_grade",
    description:
      `Apply ${dna.colorGrade.temperature} temperature, ` +
      `${dna.colorGrade.saturation} saturation, ${dna.colorGrade.contrast} contrast. ` +
      `Dominant colors: ${dna.colorGrade.dominantColors.join(", ") || "none detected"}.`,
    aiChatPrompt:
      `Apply a color grade to the project: ${dna.colorGrade.temperature} temperature, ` +
      `${dna.colorGrade.saturation} saturation, ${dna.colorGrade.contrast} contrast. ` +
      `The reference video's dominant colors were: ${dna.colorGrade.dominantColors.join(", ") || "neutral tones"}.`,
  });

  // 3. Text Style — update text overlay fonts, positions, animations
  const textOverlays = overlays.filter((o: any) => o.type === "text");
  if (textOverlays.length > 0 || dna.textStyle.frequency !== "minimal") {
    const fontFamilyMap: Record<string, string> = {
      light: "font-sans",
      normal: "font-sans",
      bold: "font-league-spartan",
      "extra-bold": "font-bungee-inline",
    };
    const targetFont = fontFamilyMap[dna.textStyle.fontWeight] || "font-sans";

    actions.push({
      type: "text_style",
      description:
        `Apply text style: ${dna.textStyle.fontWeight} weight, ` +
        `${dna.textStyle.position} position, ${dna.textStyle.animation} animation. ` +
        `Text frequency: ${dna.textStyle.frequency}. Suggested font: ${targetFont}.`,
      aiChatPrompt:
        `Update all text overlays to match this style: use ${targetFont} font family, ` +
        `position them at ${dna.textStyle.position}, use ${dna.textStyle.animation} animation. ` +
        `The reference had ${dna.textStyle.frequency} text usage with ${dna.textStyle.fontWeight} weight.`,
    });
  }

  // 4. Music Style — suggest BGM with matching tempo/genre
  const hasBGM = overlays.some((o: any) => o.type === "sound" || o.type === "audio");
  actions.push({
    type: "music",
    description:
      `${hasBGM ? "Replace" : "Add"} background music: ${dna.musicStyle.tempo} tempo, ` +
      `${dna.musicStyle.genre} genre, ${dna.musicStyle.energyLevel} energy.`,
    aiChatPrompt:
      `${hasBGM ? "Replace the current" : "Add"} background music with a ` +
      `${dna.musicStyle.tempo} tempo ${dna.musicStyle.genre} track ` +
      `at ${dna.musicStyle.energyLevel} energy level to match the reference style.`,
  });

  // 5. Graphics Density — suggest motion graphic additions/removal
  const htmlOverlays = overlays.filter(
    (o: any) => o.type === "html-scene" || o.type === "sticker",
  );
  if (dna.graphicsDensity === "heavy" && htmlOverlays.length < 3) {
    actions.push({
      type: "graphics",
      description:
        "The reference has heavy motion graphics. Add animated stickers, " +
        "emojis, or decorative elements to increase visual density.",
      aiChatPrompt:
        "Add animated stickers and motion graphic elements throughout the video " +
        "to match a graphics-heavy editing style. Include animated emojis, " +
        "subscribe badges, or decorative elements at key moments.",
    });
  } else if (dna.graphicsDensity === "minimal" && htmlOverlays.length > 2) {
    actions.push({
      type: "graphics",
      description:
        "The reference has minimal graphics. Consider removing some decorative " +
        "elements for a cleaner look.",
      aiChatPrompt:
        "Remove excess stickers and motion graphics to achieve a cleaner, " +
        "more minimal editing style matching the reference.",
    });
  } else if (dna.graphicsDensity === "moderate") {
    actions.push({
      type: "graphics",
      description:
        "The reference uses moderate graphics density. Ensure a balanced " +
        "amount of decorative elements without overwhelming the content.",
      aiChatPrompt:
        "Balance the motion graphics — add or adjust stickers and decorative " +
        "elements to achieve a moderate, professional density.",
    });
  }

  // Build summary
  const summary =
    `Style transfer plan from "${dna.sourceName}": ` +
    `${actions.length} action(s) to match the reference editing style. ` +
    `Overall pacing: ${dna.pacing.overall}, hook speed: ${dna.pacing.hookSpeed}, ` +
    `transitions: ${dna.transitions.dominant} (${dna.transitions.frequency}% with effects).`;

  return { actions, summary };
}
