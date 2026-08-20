/**
 * POST /api/services/thinkforge/script/export-for-editron
 *
 * Export a ThinkForge script as SceneDescriptors for Editron.
 * Uses an authoritative ThinkForge sidecar for generated scripts. LLM/regex parsing is
 * reserved for documents that never had a production-aware sidecar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import {
  parseScriptWithLLM,
  isLLMParserAvailable,
} from '@/lib/pipeline/llm-scene-parser';
import {
  convertThinkForgeBlocksToScenes,
  convertPlainTextToScenes,
  convertCIRToScenes,
  hasTimestampedScenes,
  EDITORIAL_HEADER_PATTERNS,
  richTextToPlain,
} from '@/lib/pipeline/script-to-scenes';
import { tiptapJSONToThinkForgeBlocks } from '@/lib/thinkforge/mappers/tiptap-to-thinkforge';
import { extractPlainText, isTiptapJSON } from '@/lib/thinkforge/schemas/tiptap-validation';
import {
  buildThinkForgeEditronHandoffContext,
  mapScriptSidecarToEditronExport,
  ThinkForgeSidecarCompilationError,
  type ThinkForgeEditronHandoffContext,
  type ScriptSidecarEditronExport,
} from '@/lib/thinkforge/export/script-sidecar-to-editron';
import { resolveThinkForgeExportDestination } from '@/lib/thinkforge/export/export-destination-policy';
import { ThinkForgeAuthoringProvenanceError } from '@/lib/thinkforge/context/brand-authoring-context';
import {
  requireCurrentPersistedScriptSidecar,
  ThinkForgeScriptSidecarAuthorityError,
} from '@/lib/thinkforge/persistence/script-sidecar-reader';
import { resolveProjectMetaBrandId } from '@/lib/thinkforge/state/types';
import type { SceneDescriptor } from '@/lib/pipeline/schemas/storyboard';

export const runtime = 'nodejs';
export const maxDuration = 300; // gemini-3.1-pro-preview needs more time for complex multi-scene scripts
const EXPORT_FOR_EDITRON_MAX_PARSER_INPUT_CHARS = 24_000;
const SCRIPT_TRUNCATED_SENTINEL = 'SCRIPT_TRUNCATED';

type TargetDurationSource = 'request' | 'script-explicit' | 'unknown';
type ExportSourceKind = 'request' | 'stored-script';

interface ExportSource {
  source: ExportSourceKind;
  blocks?: any[];
  plainText?: string;
  cir?: any;
  rawContent: string;
  title: string;
  scenePreview: SceneDescriptor[];
  sidecarExport?: ScriptSidecarEditronExport;
  thinkforgeContext?: ThinkForgeEditronHandoffContext;
}

function isParserSentinelScene(scene: Pick<SceneDescriptor, 'title'>): boolean {
  return scene.title?.trim().toUpperCase() === SCRIPT_TRUNCATED_SENTINEL;
}

function durationUnitToSeconds(value: number, unit: string): number {
  const normalized = unit.toLowerCase();
  if (/^(?:h|hours?|hrs?)$/.test(normalized)) return value * 3600;
  if (/^(?:m|minutes?|mins?)$/.test(normalized)) return value * 60;
  return value;
}

function normalizeDurationSeconds(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const rounded = Math.round(numeric);
  return Number.isSafeInteger(rounded) && rounded > 0 ? rounded : undefined;
}

function inferTargetDurationFromScript(scriptText: string): { seconds?: number; source: TargetDurationSource } {
  const cueMatch = scriptText.match(
    /\b(?:target\s*)?(?:duration|runtime|run time|length|video length|total duration)\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)\b/i,
  );
  const trailingMatch = scriptText.match(
    /\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)\s+(?:video|film|edit|piece|script)\b/i,
  );
  const match = cueMatch || trailingMatch;
  if (!match) return { source: 'unknown' };

  const amount = Number(match[1]);
  const unit = match[2];
  const seconds = normalizeDurationSeconds(durationUnitToSeconds(amount, unit));
  return seconds ? { seconds, source: 'script-explicit' } : { source: 'unknown' };
}

function countExpectedVideoClips(scenes: SceneDescriptor[]): number {
  return scenes.reduce((count, scene) => {
    const assetRecommendation = (scene as any).assetRecommendation;
    if (assetRecommendation && assetRecommendation !== 'ai-video') return count;

    const subShots = Array.isArray((scene as any).subShots) ? (scene as any).subShots : [];
    const independentSubShots = subShots.filter((subShot: any) => subShot?.independentGeneration === true);
    return count + Math.max(1, independentSubShots.length);
  }, 0);
}

function isCirDocument(value: unknown): value is { sections: unknown[]; title?: string } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as any).sections));
}

function blockText(blocks: any[]): string {
  return blocks
    .map((b: any) => richTextToPlain(b?.content || []))
    .filter(Boolean)
    .join('\n');
}

function chooseRawContent(blocks: any[] | undefined, plainText: unknown): string {
  const plain = typeof plainText === 'string' ? plainText.trim() : '';
  const fromBlocks = blocks && blocks.length > 0 ? blockText(blocks).trim() : '';
  if (!plain) return fromBlocks;
  if (!fromBlocks) return plain;
  return fromBlocks.length > plain.length ? fromBlocks : plain;
}

function exportContentMatches(left: ExportSource, right: ExportSource): boolean {
  const leftText = left.blocks?.length ? blockText(left.blocks) : left.rawContent;
  const rightText = right.blocks?.length ? blockText(right.blocks) : right.rawContent;
  const normalize = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();
  return normalize(leftText) === normalize(rightText);
}

function previewScenesForSource(source: Pick<ExportSource, 'blocks' | 'cir' | 'rawContent'>): SceneDescriptor[] {
  if (source.blocks && source.blocks.length > 0) {
    return hasTimestampedScenes(source.rawContent)
      ? convertPlainTextToScenes(source.rawContent)
      : convertThinkForgeBlocksToScenes(source.blocks);
  }
  if (isCirDocument(source.cir)) {
    return convertCIRToScenes(source.cir as any);
  }
  return convertPlainTextToScenes(source.rawContent);
}

function buildExportSource(input: {
  source: ExportSourceKind;
  blocks?: unknown;
  plainText?: unknown;
  cir?: unknown;
  titleFallback?: unknown;
}): ExportSource | null {
  const blocks = Array.isArray(input.blocks) ? input.blocks : undefined;
  const plainText = typeof input.plainText === 'string' ? input.plainText : undefined;
  const cir = isCirDocument(input.cir) ? input.cir : undefined;
  let rawContent = '';
  let title = typeof input.titleFallback === 'string' && input.titleFallback.trim()
    ? input.titleFallback.trim()
    : 'Untitled Script';

  if (blocks && blocks.length > 0) {
    rawContent = chooseRawContent(blocks, plainText);
    const firstHeader = blocks.find((b: any) => b?.kind === 'header');
    if (firstHeader) {
      const text = richTextToPlain(firstHeader.content || []);
      if (text) title = text;
    }
  } else if (cir) {
    rawContent = JSON.stringify(cir);
    title = typeof cir.title === 'string' && cir.title.trim() ? cir.title.trim() : title;
  } else if (plainText) {
    rawContent = plainText;
    const headingTitle = plainText.split('\n')[0]?.match(/^#{1,3}\s+(.+)$/)?.[1]?.trim();
    if (headingTitle) title = headingTitle.substring(0, 100);
  }

  if (!rawContent.trim()) return null;

  const source: ExportSource = {
    source: input.source,
    blocks,
    plainText,
    cir,
    rawContent,
    title,
    scenePreview: [],
  };
  source.scenePreview = previewScenesForSource(source);
  return source;
}

function longFormChapterPlanFromWriterOutput(
  writerOutput: Record<string, unknown> | undefined,
): unknown | undefined {
  if (!writerOutput || !Object.prototype.hasOwnProperty.call(writerOutput, 'longForm')) return undefined;
  const longForm = writerOutput.longForm;
  if (!longForm || typeof longForm !== 'object' || Array.isArray(longForm)) return null;
  const record = longForm as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, 'plan') || record.plan === undefined) return null;
  return record.plan;
}

function buildStoredScriptSource(
  session: NonNullable<Awaited<ReturnType<typeof db.getSession>>>,
  script: NonNullable<Awaited<ReturnType<typeof db.getScript>>>,
): ExportSource | null {
  const blocks = Array.isArray(script.blocks) && script.blocks.length > 0
    ? script.blocks
    : script.richText && isTiptapJSON(script.richText)
      ? tiptapJSONToThinkForgeBlocks(script.richText)
      : [];
  const richTextPlain = script.richText && isTiptapJSON(script.richText)
    ? extractPlainText(script.richText)
    : '';
  const plainText = typeof script.content === 'string' && script.content.trim()
    ? script.content
    : richTextPlain;

  const storedSource = buildExportSource({
    source: 'stored-script',
    blocks,
    plainText,
    titleFallback: script.title,
  });
  if (!storedSource) return null;

  const metadata = script.metadata && typeof script.metadata === 'object' && !Array.isArray(script.metadata)
    ? script.metadata as Record<string, unknown>
    : undefined;
  const writerOutput = metadata?.writerOutput && typeof metadata.writerOutput === 'object' && !Array.isArray(metadata.writerOutput)
    ? metadata.writerOutput as Record<string, unknown>
    : undefined;
  const chapterPlan = longFormChapterPlanFromWriterOutput(writerOutput);
  const authoringContext = buildThinkForgeEditronHandoffContext({
    authoringContextSnapshot: metadata?.authoringContextSnapshot,
    expectedBrandId: resolveProjectMetaBrandId(session.projectMeta),
  });
  const authoringProvenanceContext = authoringContext.authoringProvenance
    ? authoringContext
    : undefined;
  const authoritativeSidecar = requireCurrentPersistedScriptSidecar({
    metadata,
    documentContent: typeof script.content === 'string' ? script.content : '',
    documentVersion: typeof script.version === 'number' ? script.version : 0,
  });
  if (!authoritativeSidecar) {
    return authoringProvenanceContext
      ? { ...storedSource, thinkforgeContext: authoringProvenanceContext }
      : storedSource;
  }
  const rawSidecar = authoritativeSidecar.rawSidecar;

  try {
    return {
      ...storedSource,
      sidecarExport: mapScriptSidecarToEditronExport(rawSidecar, { chapterPlan }),
      thinkforgeContext: buildThinkForgeEditronHandoffContext({
        sidecar: rawSidecar,
        chapterPlan,
        briefSnapshot: metadata?.briefSnapshot,
        sourceLedger: writerOutput?.sourceLedger,
        authoringContextSnapshot: metadata?.authoringContextSnapshot,
        expectedBrandId: resolveProjectMetaBrandId(session.projectMeta),
      }),
    };
  } catch (error) {
    if (error instanceof ThinkForgeAuthoringProvenanceError) throw error;
    if (
      error instanceof ThinkForgeSidecarCompilationError
      && (error.claimedVersion === 2 || error.code.startsWith('long-form-'))
    ) {
      console.error('[export-for-editron] Stored V2 sidecar failed compilation', {
        code: error.code,
        claimedVersion: error.claimedVersion,
      });
      throw error;
    }
    console.warn('[export-for-editron] Ignoring an invalid persisted script sidecar');
    return authoringProvenanceContext
      ? { ...storedSource, thinkforgeContext: authoringProvenanceContext }
      : storedSource;
  }
}
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }
    const body = parsedBody as Record<string, unknown>;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const scriptId = typeof body.scriptId === 'string' ? body.scriptId.trim() : '';
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }
    if (!scriptId) {
      return NextResponse.json({ success: false, error: 'scriptId is required' }, { status: 400 });
    }

    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ success: false, error: 'ThinkForge session not found' }, { status: 404 });
    }
    const canonicalSessionId = String(session._id);
    const storedScript = await db.getScript(canonicalSessionId, scriptId);
    if (!storedScript) {
      return NextResponse.json({ success: false, error: 'ThinkForge document not found' }, { status: 404 });
    }
    const exportDecision = resolveThinkForgeExportDestination(storedScript.contentContract, 'editron');
    if (!exportDecision.allowed) {
      return NextResponse.json(
        { success: false, error: exportDecision.message, reason: exportDecision.code, retryable: false },
        { status: exportDecision.status },
      );
    }

    const {
      blocks: requestBlocks,
      plainText: requestPlainText,
      cir: requestCir,
      targetDurationSeconds: requestedTargetDurationSeconds,
      targetDuration,
    } = body;
    const aspectRatio = typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined;
    const artStyle = typeof body.artStyle === 'string' ? body.artStyle : undefined;
    const brandId = typeof body.brandId === 'string' ? body.brandId : undefined;

    let scenes: SceneDescriptor[] | undefined;
    let title = 'Untitled Script';
    let rawContent = '';
    let overallMusicPrompt = '';
    let characterDescriptions: Record<string, string> = {};
    let colorPalette: string[] = [];
    let environmentNotes = '';
    let globalEditDirections: any = undefined;
    let suggestedProfileCategory = '';
    // H1 FIX: Track parser fallback for frontend warning
    let parserFallback = false;
    let parserFallbackReason = '';

    const requestSource = buildExportSource({
      source: 'request',
      blocks: requestBlocks,
      plainText: requestPlainText,
      cir: requestCir,
    });

    if (!requestSource) {
      return NextResponse.json(
        {
          success: false,
          error: 'Provide one of: blocks (ThinkForgeBlock[]), plainText (string), or cir (CIRDocument)',
        },
        { status: 400 },
      );
    }

    // A generated script's sidecar is authoritative only when it describes the
    // exact script being exported. User edits intentionally fall back to parsing.
    let storedSource: ExportSource | null;
    try {
      storedSource = buildStoredScriptSource(session, storedScript);
    } catch (error) {
      if (error instanceof ThinkForgeScriptSidecarAuthorityError) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            reason: error.code,
            retryable: false,
            diagnostic: { bindingReason: error.bindingReason },
          },
          { status: error.code === 'script-sidecar-payload-invalid' ? 422 : 409 },
        );
      }
      if (error instanceof ThinkForgeAuthoringProvenanceError) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            reason: 'authoring-provenance-brand-mismatch',
          },
          { status: 409 },
        );
      }
      throw error;
    }
    let activeSource = requestSource;
    let storedScriptRecovered = false;
    if (requestSource.scenePreview.length === 0) {
      if (storedSource && storedSource.scenePreview.length > 0) {
        activeSource = storedSource;
        storedScriptRecovered = true;
        console.warn('[export-for-editron] Recovered stored script source after request snapshot produced no scenes', JSON.stringify({
          requestRawContentLength: requestSource.rawContent.length,
          requestBlocksCount: requestSource.blocks?.length ?? 0,
          storedRawContentLength: storedSource.rawContent.length,
          storedBlocksCount: storedSource.blocks?.length ?? 0,
          storedScenePreviewCount: storedSource.scenePreview.length,
        }));
      }
    }
    if (
      storedSource?.sidecarExport
      && activeSource.source !== 'stored-script'
      && !exportContentMatches(requestSource, storedSource)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'The editor contains changes that have not been committed to the saved script contract.',
          reason: 'document-not-committed',
          retryable: true,
        },
        { status: 409 },
      );
    }
    const sidecarSource = storedSource?.sidecarExport ? storedSource : undefined;
    const sidecarExport = sidecarSource?.sidecarExport;
    const thinkforgeContext = sidecarSource?.thinkforgeContext;

    const blocks = activeSource.blocks;
    const plainText = activeSource.plainText;
    const cir = activeSource.cir;
    rawContent = activeSource.rawContent;
    title = activeSource.title;
    const exportSource = activeSource.source;
    const requestTargetDurationSeconds =
      normalizeDurationSeconds(requestedTargetDurationSeconds) ?? normalizeDurationSeconds(targetDuration);
    const scriptTargetDuration = requestTargetDurationSeconds
      ? { seconds: requestTargetDurationSeconds, source: 'request' as TargetDurationSource }
      : inferTargetDurationFromScript(rawContent);
    const targetDurationSeconds = scriptTargetDuration.seconds;
    const targetDurationSource = scriptTargetDuration.source;

    if (!sidecarExport && rawContent.length > EXPORT_FOR_EDITRON_MAX_PARSER_INPUT_CHARS) {
      const diagnostic = {
        rawContentLength: rawContent.length,
        maxParserInputChars: EXPORT_FOR_EDITRON_MAX_PARSER_INPUT_CHARS,
        hasBlocks: Array.isArray(blocks) && blocks.length > 0,
        hasPlainText: !!plainText,
        hasCir: !!cir,
        source: exportSource,
        storedScriptRecovered,
      };
      console.error('[export-for-editron] 422: Script exceeds LLM parser input limit. Diagnostic:', JSON.stringify(diagnostic));
      return NextResponse.json(
        {
          success: false,
          error: 'Script is too long to parse safely for Editron export. Split it into shorter sections and export again.',
          reason: 'script-too-long-for-parser',
          retryable: false,
          diagnostic,
        },
        { status: 422 },
      );
    }
    // ─── Try LLM parser first (Gemini Flash) ───────────────────
    const llmAvailable = isLLMParserAvailable();
    const rawContentLength = rawContent.length;

    if (sidecarExport) {
      scenes = sidecarExport.scenes;
      overallMusicPrompt = sidecarExport.overallMusicPrompt;
      characterDescriptions = sidecarExport.characterDescriptions;
      colorPalette = sidecarExport.colorPalette;
      environmentNotes = sidecarExport.environmentNotes;
      globalEditDirections = sidecarExport.globalEditDirections;
      suggestedProfileCategory = sidecarExport.suggestedProfileCategory;
    } else if (llmAvailable && rawContentLength > 0) {
      try {
        const llmResult = await parseScriptWithLLM(rawContent, {
          aspectRatio,
          artStyle,
          ...(targetDurationSeconds ? { targetDuration: targetDurationSeconds } : {}),
          brandId,
          userId,
        });

        // Map LLM output to SceneDescriptor format (pass through all LLM-generated fields)
        const parsedScenes: SceneDescriptor[] = llmResult.scenes.map((s: any, i: number) => ({
          sceneIndex: i,
          title: s.title,
          narration: s.narration,
          visualDescription: s.visualDescription,
          videoMotionPrompt: s.videoMotionPrompt,
          audioDescription: s.audioDescription,
          musicDescription: (s as any).musicDescription || '',
          sfxDescription: (s as any).sfxDescription || '',
          durationSeconds: s.durationSeconds,
          // Rule 8N: propagate explicit-timestamp detection (set by the Fix-4
          // post-processor in llm-scene-parser.ts). Consumed by
          // edit-direction-applier to skip the pacing multiplier on scenes whose
          // duration came from an explicit script timestamp.
          durationWasExplicit: (s as any).durationWasExplicit === true,
          mood: s.mood,
          imageQualityTokens: s.imageQualityTokens,
          videoQualityTokens: s.videoQualityTokens,
          editDirections: (s as any).editDirections || undefined,
          // Montage fields — pass through from parser (subShots, sceneType, generationUnitId)
          ...((s as any).subShots && { subShots: (s as any).subShots }),
          ...((s as any).sceneType && { sceneType: (s as any).sceneType }),
          ...((s as any).generationUnitId && { generationUnitId: (s as any).generationUnitId }),
          ...((s as any).primaryVisualForUnit !== undefined && { primaryVisualForUnit: (s as any).primaryVisualForUnit }),
          ...((s as any).assetRecommendation && { assetRecommendation: (s as any).assetRecommendation }),
        }));
        scenes = parsedScenes;
        overallMusicPrompt = llmResult.overallMusicPrompt || '';
        characterDescriptions = llmResult.characterDescriptions || {};
        colorPalette = llmResult.colorPalette || [];
        environmentNotes = llmResult.environmentNotes || '';
        globalEditDirections = (llmResult as any).globalEditDirections || undefined;
        // LLM-suggested profile category for detection filtering (2026-04-17)
        suggestedProfileCategory = (llmResult as any).suggestedProfileCategory || '';

      } catch (llmError: any) {
        // Log the FULL error (not just message) so we can see 401s, model-not-found, rate limits, etc.
        console.error('[export-for-editron] LLM parsing FAILED:', {
          message: llmError.message,
          status: llmError.status || llmError.statusCode || llmError.code,
          name: llmError.name,
          stack: llmError.stack?.split('\n').slice(0, 3).join(' → '),
        });
        // H1 FIX: Track that we fell back to regex so frontend can warn user
        parserFallback = true;
        parserFallbackReason = `${llmError.name || 'Error'}: ${llmError.message}`;
        // Fall through to regex parsing below
      }
    }

    // ─── Fallback: regex-based parsing ─────────────────────────
    if (!scenes || scenes.length === 0) {
      parserFallback = true;

      if (blocks && Array.isArray(blocks) && blocks.length > 0) {
        if (hasTimestampedScenes(rawContent)) {
          scenes = convertPlainTextToScenes(rawContent);
        } else {
          scenes = convertThinkForgeBlocksToScenes(blocks);
        }
      } else if (cir && cir.sections) {
        scenes = convertCIRToScenes(cir);
      } else {
        scenes = convertPlainTextToScenes(rawContent);
      }
    }

    if (!scenes || scenes.length === 0) {
      // Diagnostic context so we can actually debug 422s instead of guessing
      const diagnostic = {
        llmAvailable,
        rawContentLength,
        blocksCount: blocks?.length ?? 0,
        hasPlainText: !!plainText,
        hasCir: !!cir,
        parserFallback,
        parserFallbackReason: parserFallbackReason || undefined,
        rawContentEmpty: rawContent.length === 0,
        source: exportSource,
        storedScriptRecovered,
      };
      console.error('[export-for-editron] 422: No scenes extracted. Diagnostic:', JSON.stringify(diagnostic));
      return NextResponse.json(
        {
          success: false,
          error: 'No scenes could be extracted from the script',
          diagnostic,
        },
        { status: 422 },
      );
    }

    const sentinelScenes = scenes.filter(isParserSentinelScene);
    if (sentinelScenes.length > 0) {
      const diagnostic = {
        reason: 'parser-returned-sentinel-scene',
        sentinelSceneIndexes: sentinelScenes.map((scene) => scene.sceneIndex ?? 0),
        totalScenes: scenes.length,
      };
      console.error('[export-for-editron] 422: Parser returned sentinel scene. Diagnostic:', JSON.stringify(diagnostic));
      return NextResponse.json(
        {
          success: false,
          error: 'Script parsing produced an internal truncation marker instead of a real scene. Split the script into shorter sections and retry.',
          reason: 'parser-sentinel-scene',
          retryable: false,
          diagnostic,
        },
        { status: 422 },
      );
    }
    // ─── Parser output quality validation (Rule 2N: No Fallbacks as Solutions) ─────
    //
    // When the LLM parser fails (timeout, API error), the regex fallback runs.
    // For structured scripts containing editorial headers ("Emotional Target:",
    // "Instrumentation:", "Visual:", "Audio:", etc.), the regex parser produces
    // garbage output: it dumps the ENTIRE scene block into BOTH narration AND
    // visualDescription fields, identical character-for-character.
    //
    // Concrete failure witnessed 2026-04-17 in proj_a83yxEs73pKg / sb_pq2iQh5xGLaQ:
    // - narration.length === visualDescription.length (622 / 906 / 630 chars)
    // - narration === visualDescription (byte-identical)
    // - narration starts with "Emotional Target: Immediate engagement..."
    // - TTS then tried to SPEAK that metadata (46-62s of speech for 10s scenes)
    //
    // This is exactly what Rule 2N prohibits — a fallback that silently produces
    // unusable output, burning user credits on garbage while hiding the real
    // LLM-parser problem. Better to fail loudly so user retries — on retry the
    // LLM parser is usually warm and works. See pipeline_investigations.md
    // "LLM parser cold-start timeouts force regex fallback with destructive data shape"
    // for full root-cause analysis.
    //
    // The validation catches TWO specific garbage patterns that indicate regex
    // fallback on a structured script:
    // 1. narration and visualDescription are byte-identical (the clear dump smell)
    // 2. narration starts with a script-editorial header, indicating the parser
    //    confused metadata for spoken dialogue
    //
    // Scripts that legitimately use regex fallback (simple prose scripts without
    // editorial scaffolding) will pass both checks and proceed normally.
    //
    // NOTE: EDITORIAL_HEADER_PATTERNS is imported from script-to-scenes.ts so the
    // detection list is a single source of truth. The regex parser uses the same
    // list to route editorial headers to rawProductionNotes instead of narration
    // (commit after 079c0ae7). If this gate ever trips now, it's a legitimate
    // signal of a NEW editorial pattern we haven't seen — the fix is to add the
    // pattern to EDITORIAL_HEADER_PATTERNS in script-to-scenes.ts, not to
    // duplicate the list here.
    const qualityIssues: Array<{ sceneIndex: number; issue: string }> = [];
    for (const scene of scenes) {
      const narr = (scene.narration || '').trim();
      const vis = (scene.visualDescription || '').trim();

      // Check 1: identical narration and visualDescription (regex dump smell)
      if (narr.length > 50 && narr === vis) {
        qualityIssues.push({
          sceneIndex: scene.sceneIndex ?? 0,
          issue: `narration and visualDescription are byte-identical (${narr.length} chars) — regex parser dumped entire scene block into both fields`,
        });
        continue; // One issue per scene is enough for diagnosis
      }

      // Check 2: narration starts with an editorial metadata header
      // (indicates parser mistook metadata for dialogue)
      for (const pattern of EDITORIAL_HEADER_PATTERNS) {
        if (pattern.test(narr)) {
          qualityIssues.push({
            sceneIndex: scene.sceneIndex ?? 0,
            issue: `narration starts with editorial header matching ${pattern.source} — got: "${narr.slice(0, 50)}..."`,
          });
          break;
        }
      }
    }

    if (qualityIssues.length > 0) {
      const diagnostic = {
        llmAvailable,
        parserFallback,
        parserFallbackReason: parserFallbackReason || undefined,
        qualityIssues,
        scenesAffected: qualityIssues.length,
        totalScenes: scenes.length,
      };
      console.error('[export-for-editron] 422: Parser output quality check FAILED. Diagnostic:', JSON.stringify(diagnostic));
      return NextResponse.json(
        {
          success: false,
          error: 'Script could not be parsed cleanly. The AI parser was temporarily unavailable and the fallback parser could not cleanly separate narration from visual descriptions. Please retry in ~30 seconds — the AI parser typically works on retry after a cold start.',
          reason: 'parser-quality-check-failed',
          retryable: true,
          parserFallback,
          parserFallbackReason: parserFallbackReason || undefined,
          qualityIssues,
        },
        { status: 422 },
      );
    }

    const totalDurationSeconds = scenes.reduce((sum, s) => sum + (Number(s.durationSeconds) || 0), 0);
    const productionManifest = {
      version: 1,
      sourceService: 'thinkforge',
      sourceSessionId: canonicalSessionId,
      sourceScriptId: scriptId,
      targetDurationSeconds: targetDurationSeconds ?? null,
      targetDurationSource,
      parsedDurationSeconds: Math.round(totalDurationSeconds),
      expectedSceneCount: scenes.length,
      expectedStoryboardImages: scenes.length,
      expectedVideoClips: countExpectedVideoClips(scenes),
      coveragePolicy: 'production-require-all-scenes',
      parser: {
        llmAvailable,
        fallbackUsed: parserFallback,
        fallbackReason: parserFallbackReason || undefined,
        inputLength: rawContentLength,
        maxInputChars: EXPORT_FOR_EDITRON_MAX_PARSER_INPUT_CHARS,
        source: exportSource,
        storedScriptRecovered,
        sidecarUsed: Boolean(sidecarExport),
        sidecarVersion: sidecarExport?.sidecarVersion,
        sidecarSource: sidecarExport ? 'stored-script' : undefined,
      },
      ...(thinkforgeContext ? { thinkforgeContext } : {}),
      warnings: targetDurationSeconds
        ? []
        : ['target-duration-missing-parser-used-short-form-defaults'],
    };

    return NextResponse.json({
      success: true,
      title,
      scenes,
      sceneCount: scenes.length,
      totalDurationSeconds,
      productionManifest,
      overallMusicPrompt,
      characterDescriptions,
      colorPalette,
      environmentNotes,
      globalEditDirections,
      suggestedProfileCategory,
      // H1 FIX: Notify frontend when LLM parser failed and regex fallback was used
      ...(parserFallback && { parserFallback: true, parserFallbackReason }),
    });
  } catch (error: any) {
    console.error('[export-for-editron] Error:', error);
    if (error instanceof ThinkForgeSidecarCompilationError) {
      return NextResponse.json(
        {
          success: false,
          error: 'The saved script production contract is invalid and cannot be exported safely.',
          reason: 'invalid-script-sidecar',
          retryable: false,
          diagnostic: {
            code: error.code,
            claimedSidecarVersion: error.claimedVersion,
          },
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to export script' },
      { status: 500 },
    );
  }
}
