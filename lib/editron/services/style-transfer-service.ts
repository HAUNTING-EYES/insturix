/**
 * Style Transfer Service
 *
 * Extracts an "Edit DNA" style profile from a reference video using Gemini Vision,
 * and generates a plan to apply that style to an Editron project.
 */

import { getDatabase, COLLECTIONS } from "../db/mongodb";
import {
  resolveStyleReferenceSourceV1,
  type StyleReferenceExtractionTargetV1,
} from './style-reference-source-v1';

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
/*  extractEditDNA                                                         */
/* ====================================================================== */

export async function extractEditDNA(
  params: Readonly<StyleReferenceExtractionTargetV1>,
): Promise<EditDNA> {
  const source = await resolveStyleReferenceSourceV1(params);
  const { extractReferenceAnalysis } = await import('./reference-content-extractor');
  const analysis = await extractReferenceAnalysis({
    userId: params.userId,
    ...(params.orgId ? { orgId: params.orgId } : {}),
    source,
  });
  const dna: EditDNA = {
    ...analysis.dna,
    sourceName: source.sourceName,
    sourceAssetId: source.referenceAssetId,
  };
  await saveProfile(params.userId, dna);
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
  const { projectService } = await import('./project-service');
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
