/**
 * Style Transfer Service
 *
 * Extracts an "Edit DNA" style profile from a reference video using Gemini Vision,
 * and generates a plan to apply that style to an Editron project.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
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
  } catch {
    return false;
  }
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
async function resolveVideoUrl(
  overlayId: string,
  userId: string,
  projectId: string,
): Promise<string> {
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

  const resolved = await assetResolver.resolveAssetUrl(assetId, userId);
  if (!resolved) throw new Error("Could not resolve video asset URL");

  return resolved;
}

/* ====================================================================== */
/*  extractEditDNA                                                         */
/* ====================================================================== */

const EDIT_DNA_PROMPT = `You are a professional video editor analyzing a reference video's editing style.

Analyze this video's editing style in detail. Extract these attributes:

1. **Cut rhythm**: How often are there cuts? What's the average cuts per minute? Is the pattern steady, building (gradually faster), fast-slow-fast, or random? What's the average clip duration in seconds?

2. **Transitions**: What's the dominant transition type — hard cuts, fades, wipes, zoom punches, or slides? What percentage of cuts use a visible transition effect (vs. hard cuts)?

3. **Color grade**: Is the temperature warm, cool, or neutral? Is saturation high, normal, or desaturated? Is contrast high, normal, or low? What are 2-4 dominant hex colors you see?

4. **Text/graphics style**: Are there text overlays? What font weight (light/normal/bold/extra-bold)? Where are they positioned (center/lower_third/top/varied)? What animation style (fade/slide/pop/typewriter/none)? How frequently do they appear (heavy/moderate/minimal)?

5. **Music style**: What's the tempo (slow/medium/fast)? What genre? What energy level (low/medium/high)?

6. **Pacing**: What's the overall pacing (slow/medium/fast)? How fast is the hook / first 5 seconds (fast/medium)? How fast is the main content (slow/medium/fast)?

7. **Graphics density**: How many motion graphics, stickers, emojis, icons, or decorative elements appear? (heavy/moderate/minimal)

Return your analysis as a JSON object matching this exact schema (no markdown, just raw JSON):
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
}`;

export async function extractEditDNA(params: {
  videoOverlayId?: string;
  videoUrl?: string;
  sourceName?: string;
  userId: string;
  projectId?: string;
}): Promise<EditDNA> {
  const { videoOverlayId, videoUrl, sourceName, userId, projectId } = params;

  // Validate: we need either an overlay ID (with projectId) or a direct URL
  if (!videoOverlayId && !videoUrl) {
    throw new Error(
      "Either videoOverlayId (with projectId) or videoUrl is required",
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
  if (videoOverlayId && projectId) {
    resolvedUrl = await resolveVideoUrl(videoOverlayId, userId, projectId);
  } else if (videoUrl) {
    resolvedUrl = videoUrl;
  } else {
    throw new Error("projectId is required when using videoOverlayId");
  }

  // Call Gemini 2.0 Flash with the video
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  console.log("[STYLE-TRANSFER] Sending video to Gemini for Edit DNA extraction...");

  const result = await model.generateContent([
    {
      fileData: {
        mimeType: "video/mp4",
        fileUri: resolvedUrl,
      },
    },
    { text: EDIT_DNA_PROMPT },
  ]);

  const responseText = result.response.text();
  console.log("[STYLE-TRANSFER] Gemini response received, parsing...");

  // Parse the JSON response — Gemini sometimes wraps in markdown code blocks
  let parsed: any;
  try {
    const cleaned = responseText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error("[STYLE-TRANSFER] Failed to parse Gemini response:", responseText);
    throw new Error(
      "Failed to parse style analysis from Gemini. The model returned an unexpected format.",
    );
  }

  // Build the EditDNA profile
  const profileId = `style_${nanoid(12)}`;
  const dna: EditDNA = {
    profileId,
    sourceName: sourceName || "Reference Video",
    sourceUrl: videoUrl || undefined,

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
  console.log(`[STYLE-TRANSFER] Saved Edit DNA profile ${profileId} for user ${userId}`);

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

  console.log(
    `[STYLE-TRANSFER] Generated application plan with ${actions.length} actions for project ${projectId}`,
  );

  return { actions, summary };
}
