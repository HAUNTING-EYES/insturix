import { z } from 'zod';

import {
  createGlmVisionClient,
  type GlmVisionContentPart,
  type GlmVisionJsonClient,
} from './glm-vision-client';

export const SAAS_REFERENCE_RUBRIC_VERSION = 'saas-reference-v1';
export const REQUIRED_GATE_FRAME_COUNT = 5;
export const MAX_REFERENCE_EVALUATION_SECONDS = 120;
export const DEFAULT_SAAS_GATE_THRESHOLD = 0.82;
export const DEFAULT_GLM_GATE_MODEL = 'glm-4.6v-flashx';
export const DEFAULT_GLM_ANALYSIS_MODEL = 'glm-4.6v';

const saasGateFrameVerdictSchema = z.object({
  frameIndex: z.number().int().min(0).max(REQUIRED_GATE_FRAME_COUNT - 1),
  isSaasFrame: z.boolean(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).max(6).default([]),
});

export const saasReferenceGateSchema = z.object({
  isSaasVideo: z.boolean(),
  confidence: z.number().min(0).max(1),
  category: z.enum([
    'saas_product_demo',
    'software_walkthrough',
    'marketing_launch',
    'unclear',
    'non_saas',
  ]),
  evidence: z.array(z.string()).min(1).max(10),
  rejectionReasons: z.array(z.string()).max(8).default([]),
  sampledFrameVerdicts: z.array(saasGateFrameVerdictSchema).length(REQUIRED_GATE_FRAME_COUNT),
});

export const saasReferenceStyleAnalysisSchema = z.object({
  summary: z.string().min(1),
  saasCategory: z.enum(['saas_product_demo', 'software_walkthrough', 'marketing_launch']),
  evaluationWindowSec: z.number().positive().max(MAX_REFERENCE_EVALUATION_SECONDS),
  structure: z.object({
    hook: z.string().min(1),
    demoFlow: z.array(z.string()).min(1).max(12),
    proofMoments: z.array(z.string()).max(8).default([]),
    cta: z.string().optional(),
  }),
  styleSignals: z.object({
    pacing: z.object({
      speed: z.enum(['slow', 'medium', 'fast']),
      cutRhythm: z.string().min(1),
      attentionPattern: z.string().min(1),
    }),
    visualLanguage: z.array(z.string()).min(1).max(12),
    uiTreatment: z.object({
      density: z.enum(['minimal', 'balanced', 'dense']),
      framing: z.string().min(1),
      screenshotTreatment: z.string().min(1),
    }),
    typography: z.object({
      weight: z.string().min(1),
      hierarchy: z.string().min(1),
      motion: z.string().min(1),
    }),
    color: z.object({
      palette: z.array(z.string()).min(1).max(8),
      contrast: z.string().min(1),
      backgroundTreatment: z.string().min(1),
    }),
    motion: z.object({
      transitionStyle: z.string().min(1),
      cameraMoves: z.array(z.string()).max(8).default([]),
      microInteractions: z.array(z.string()).max(8).default([]),
    }),
    brandTransferBoundaries: z.array(z.string()).min(1).max(10),
  }),
  decisionInputs: z.array(z.string()).min(1).max(12),
  risks: z.array(z.string()).max(8).default([]),
});

export type SaasReferenceGate = z.infer<typeof saasReferenceGateSchema>;
export type SaasReferenceStyleAnalysis = z.infer<typeof saasReferenceStyleAnalysisSchema>;

export interface SaasReferenceVideoInput {
  videoUrl: string;
  frameImageUrls: readonly string[];
  durationSec?: number;
  sourceLabel?: string;
  script?: string;
  brandContext?: string;
  client?: GlmVisionJsonClient;
  gateModel?: string;
  analysisModel?: string;
  gateThreshold?: number;
  requireAllFrames?: boolean;
}

export interface SaasGateDecision {
  accepted: boolean;
  threshold: number;
  requireAllFrames: boolean;
  passedFrameCount: number;
  totalFrameCount: number;
  reason?: string;
}

export type SaasGateResult =
  | {
    ok: true;
    gate: SaasReferenceGate;
    decision: SaasGateDecision;
    cacheKey: string;
    model?: string;
    usage?: unknown;
  }
  | {
    ok: false;
    reason: string;
    diagnostics: string[];
    cacheKey?: string;
    raw?: unknown;
  };

export type SaasReferenceAnalysisResult =
  | {
    ok: true;
    gate: SaasReferenceGate;
    gateDecision: SaasGateDecision;
    analysis: SaasReferenceStyleAnalysis;
    evaluationWindowSec: number;
    cacheKey: string;
    model?: string;
    usage?: unknown;
  }
  | {
    ok: false;
    reason: string;
    diagnostics: string[];
    gate?: SaasReferenceGate;
    gateDecision?: SaasGateDecision;
    cacheKey?: string;
    raw?: unknown;
  };

const SAAS_GATE_SYSTEM_PROMPT = `You are a strict SaaS reference-video intake validator.
Return only valid JSON.
Accept videos showing SaaS products, software UI walkthroughs, product launch films, dashboards, app flows, or product-demo motion.
Reject generic lifestyle footage, talking-head-only clips without product/UI evidence, landscapes, unrelated entertainment, and ads with no software product surface.
This validator only decides whether the video is a valid reference source. It does not decide final creative form.`;

const SAAS_ANALYSIS_SYSTEM_PROMPT = `You analyze SaaS product reference videos for transferable creative evidence.
Return only valid JSON.
Extract style evidence that a downstream director/composer can use as context: pacing, UI treatment, typography feel, palette, motion language, structure, proof moments, and risk notes.
Do not copy logos, proprietary claims, exact layouts, exact wording, private customer data, or brand-owned assets.
Do not output final render keyframes, concrete overlay timings, SFX tokens, asset queries, or animation implementation details.`;

export async function validateSaasReferenceVideo(
  input: SaasReferenceVideoInput,
): Promise<SaasGateResult> {
  const diagnostics = validateInputShape(input);
  const cacheKey = buildReferenceVideoCacheKey(input, 'gate', input.gateModel ?? DEFAULT_GLM_GATE_MODEL);
  if (diagnostics.length > 0) {
    return { ok: false, reason: 'invalid_reference_video_input', diagnostics, cacheKey };
  }

  const client = input.client ?? createGlmVisionClient({ model: input.gateModel ?? DEFAULT_GLM_GATE_MODEL });
  const response = await client.analyzeJson({
    model: input.gateModel ?? DEFAULT_GLM_GATE_MODEL,
    messages: [
      { role: 'system', content: SAAS_GATE_SYSTEM_PROMPT },
      { role: 'user', content: buildGateContent(input) },
    ],
    temperature: 0,
    maxTokens: 1_200,
    thinking: 'disabled',
    cacheKey,
  });

  if (!response.ok) {
    return {
      ok: false,
      reason: 'glm_gate_request_failed',
      diagnostics: [response.error],
      cacheKey,
      raw: response.raw,
    };
  }

  const parsed = saasReferenceGateSchema.safeParse(response.json);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'glm_gate_schema_invalid',
      diagnostics: parsed.error.issues.map(formatZodIssue),
      cacheKey,
      raw: response.json,
    };
  }

  const decision = decideSaasGate(parsed.data, {
    threshold: input.gateThreshold ?? DEFAULT_SAAS_GATE_THRESHOLD,
    requireAllFrames: input.requireAllFrames ?? true,
  });

  return {
    ok: true,
    gate: parsed.data,
    decision,
    cacheKey,
    model: response.model,
    usage: response.usage,
  };
}

export async function analyzeSaasReferenceVideo(
  input: SaasReferenceVideoInput,
): Promise<SaasReferenceAnalysisResult> {
  const gate = await validateSaasReferenceVideo(input);
  if (!gate.ok) return gate;
  if (!gate.decision.accepted) {
    return {
      ok: false,
      reason: 'not_a_saas_reference_video',
      diagnostics: [gate.decision.reason ?? 'Reference video did not pass SaaS gate.'],
      gate: gate.gate,
      gateDecision: gate.decision,
      cacheKey: gate.cacheKey,
    };
  }

  const evaluationWindowSec = getReferenceEvaluationWindowSec(input.durationSec);
  const analysisModel = input.analysisModel ?? DEFAULT_GLM_ANALYSIS_MODEL;
  const cacheKey = buildReferenceVideoCacheKey(input, 'analysis', analysisModel);
  const client = input.client ?? createGlmVisionClient({ model: analysisModel });
  const response = await client.analyzeJson({
    model: analysisModel,
    messages: [
      { role: 'system', content: SAAS_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: buildAnalysisContent(input, gate.gate, evaluationWindowSec) },
    ],
    temperature: 0,
    maxTokens: 3_200,
    thinking: 'disabled',
    cacheKey,
  });

  if (!response.ok) {
    return {
      ok: false,
      reason: 'glm_analysis_request_failed',
      diagnostics: [response.error],
      gate: gate.gate,
      gateDecision: gate.decision,
      cacheKey,
      raw: response.raw,
    };
  }

  const parsed = saasReferenceStyleAnalysisSchema.safeParse(response.json);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'glm_analysis_schema_invalid',
      diagnostics: parsed.error.issues.map(formatZodIssue),
      gate: gate.gate,
      gateDecision: gate.decision,
      cacheKey,
      raw: response.json,
    };
  }

  return {
    ok: true,
    gate: gate.gate,
    gateDecision: gate.decision,
    analysis: {
      ...parsed.data,
      evaluationWindowSec,
    },
    evaluationWindowSec,
    cacheKey,
    model: response.model,
    usage: response.usage,
  };
}

export function decideSaasGate(
  gate: SaasReferenceGate,
  options: { threshold?: number; requireAllFrames?: boolean } = {},
): SaasGateDecision {
  const threshold = options.threshold ?? DEFAULT_SAAS_GATE_THRESHOLD;
  const requireAllFrames = options.requireAllFrames ?? true;
  const passedFrameCount = gate.sampledFrameVerdicts.filter(
    (frame) => frame.isSaasFrame && frame.confidence >= threshold,
  ).length;
  const totalFrameCount = gate.sampledFrameVerdicts.length;
  const frameRequirementMet = requireAllFrames
    ? passedFrameCount === totalFrameCount
    : passedFrameCount >= Math.max(1, totalFrameCount - 1);
  const accepted = gate.isSaasVideo
    && gate.confidence >= threshold
    && frameRequirementMet
    && gate.category !== 'non_saas'
    && gate.category !== 'unclear';

  return {
    accepted,
    threshold,
    requireAllFrames,
    passedFrameCount,
    totalFrameCount,
    reason: accepted
      ? undefined
      : buildGateRejectionReason(gate, threshold, passedFrameCount, totalFrameCount, requireAllFrames),
  };
}

export function getReferenceEvaluationWindowSec(durationSec?: number): number {
  if (!Number.isFinite(durationSec) || !durationSec || durationSec <= 0) {
    return MAX_REFERENCE_EVALUATION_SECONDS;
  }
  return Math.min(Math.ceil(durationSec), MAX_REFERENCE_EVALUATION_SECONDS);
}

export function buildGateFrameSchedule(durationSec: number, sampleCount = REQUIRED_GATE_FRAME_COUNT): number[] {
  const count = Math.max(1, Math.floor(sampleCount));
  const windowSec = getReferenceEvaluationWindowSec(durationSec);
  if (count === 1) return [0];
  const lastFrameSec = Math.max(0, windowSec - 0.5);
  return Array.from({ length: count }, (_unused, index) => (
    Number(((lastFrameSec * index) / (count - 1)).toFixed(2))
  ));
}

export function buildReferenceVideoCacheKey(
  input: Pick<SaasReferenceVideoInput, 'videoUrl' | 'frameImageUrls' | 'durationSec' | 'script' | 'brandContext'>,
  stage: 'gate' | 'analysis',
  model: string,
): string {
  const payload = JSON.stringify({
    stage,
    model,
    rubricVersion: SAAS_REFERENCE_RUBRIC_VERSION,
    videoUrl: input.videoUrl,
    frameImageUrls: input.frameImageUrls,
    durationSec: getReferenceEvaluationWindowSec(input.durationSec),
    script: input.script ?? '',
    brandContext: input.brandContext ?? '',
  });
  return `${SAAS_REFERENCE_RUBRIC_VERSION}:${stage}:${stableHash(payload)}`;
}

function buildGateContent(input: SaasReferenceVideoInput): GlmVisionContentPart[] {
  const durationLabel = input.durationSec ? `${input.durationSec}s` : 'unknown duration';
  const parts: GlmVisionContentPart[] = [{
    type: 'text',
    text: `Validate this candidate SaaS reference video from 5 sampled frames.
Source: ${input.sourceLabel ?? 'reference video'}
Duration: ${durationLabel}
Evaluation cap: ${MAX_REFERENCE_EVALUATION_SECONDS}s

Return this exact JSON shape:
{
  "isSaasVideo": true,
  "confidence": 0.95,
  "category": "saas_product_demo",
  "evidence": ["specific visible UI/product evidence"],
  "rejectionReasons": [],
  "sampledFrameVerdicts": [
    { "frameIndex": 0, "isSaasFrame": true, "confidence": 0.95, "evidence": ["visible dashboard"] }
  ]
}

Rules:
- sampledFrameVerdicts must contain exactly 5 entries, frameIndex 0 through 4.
- Evidence must cite visible software/product/demo signals from the frames.
- If any frame lacks SaaS/product/UI evidence, mark that frame false and explain why.
- Do not infer from brand fame or title alone.`,
  }];

  input.frameImageUrls.forEach((url, index) => {
    parts.push({ type: 'text', text: `Frame ${index} of ${REQUIRED_GATE_FRAME_COUNT - 1}:` });
    parts.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  });

  return parts;
}

function buildAnalysisContent(
  input: SaasReferenceVideoInput,
  gate: SaasReferenceGate,
  evaluationWindowSec: number,
): GlmVisionContentPart[] {
  return [
    {
      type: 'text',
      text: `Analyze this SaaS reference video for transferable style evidence.
Source: ${input.sourceLabel ?? 'reference video'}
Evaluation window: first ${evaluationWindowSec}s only.
Gate category: ${gate.category}
Gate evidence: ${gate.evidence.join('; ')}
Brand context available to downstream generation:
${input.brandContext?.trim() || '(none provided)'}
Optional user script:
${input.script?.trim() || '(none provided)'}

Return this exact JSON shape:
{
  "summary": "short reference summary",
  "saasCategory": "saas_product_demo",
  "evaluationWindowSec": ${evaluationWindowSec},
  "structure": {
    "hook": "what the opening does",
    "demoFlow": ["sequence of product/story beats"],
    "proofMoments": ["specific proof moments"],
    "cta": "CTA shape if visible"
  },
  "styleSignals": {
    "pacing": { "speed": "medium", "cutRhythm": "description", "attentionPattern": "description" },
    "visualLanguage": ["transferable visual traits"],
    "uiTreatment": { "density": "balanced", "framing": "description", "screenshotTreatment": "description" },
    "typography": { "weight": "description", "hierarchy": "description", "motion": "description" },
    "color": { "palette": ["#111111"], "contrast": "description", "backgroundTreatment": "description" },
    "motion": { "transitionStyle": "description", "cameraMoves": ["moves"], "microInteractions": ["interactions"] },
    "brandTransferBoundaries": ["what must not be copied"]
  },
  "decisionInputs": ["evidence usable by a downstream director"],
  "risks": ["uncertainty or missing signal"]
}

Important:
- Extract reference evidence only.
- Do not output exact keyframes, durations per scene, asset queries, SFX tokens, or final render instructions.
- If the video is longer than ${MAX_REFERENCE_EVALUATION_SECONDS}s, ignore everything after ${MAX_REFERENCE_EVALUATION_SECONDS}s.`,
    },
    { type: 'video_url', video_url: { url: input.videoUrl } },
  ];
}

function validateInputShape(input: SaasReferenceVideoInput): string[] {
  const diagnostics: string[] = [];
  if (!input.videoUrl.trim()) diagnostics.push('videoUrl is required.');
  if (input.frameImageUrls.length !== REQUIRED_GATE_FRAME_COUNT) {
    diagnostics.push(`Exactly ${REQUIRED_GATE_FRAME_COUNT} sampled frame image URLs are required.`);
  }
  input.frameImageUrls.forEach((url, index) => {
    if (!url.trim()) diagnostics.push(`frameImageUrls[${index}] is empty.`);
  });
  return diagnostics;
}

function buildGateRejectionReason(
  gate: SaasReferenceGate,
  threshold: number,
  passedFrameCount: number,
  totalFrameCount: number,
  requireAllFrames: boolean,
): string {
  if (!gate.isSaasVideo) return gate.rejectionReasons[0] ?? 'Model did not classify this as a SaaS video.';
  if (gate.category === 'unclear' || gate.category === 'non_saas') return `Gate category is ${gate.category}.`;
  if (gate.confidence < threshold) return `Gate confidence ${gate.confidence} is below ${threshold}.`;
  const frameRule = requireAllFrames ? 'all frames' : 'all but one frame';
  return `Only ${passedFrameCount}/${totalFrameCount} frames passed; required ${frameRule}.`;
}

function formatZodIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 33) ^ value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
