import { createHash } from 'node:crypto';

import { SchemaType, type ResponseSchema } from '@google/generative-ai';

import {
  buildGeminiHumanParts,
  type ChatFrameEvidence,
} from '../agent/chat-frame-evidence';
import { ANALYSIS_MODEL_NAME, getAnalysisModel } from '../utils/gemini-model-factory';

export type ChatFrameVisualMatchQuality = 'exact' | 'clear-semantic' | 'partial' | 'absent';

export interface ChatFrameVisualVerification {
  status: 'confirmed' | 'rejected';
  receiptId: string;
  frame: number;
  query: string;
  provider: 'gemini';
  model: string;
  matchQuality: ChatFrameVisualMatchQuality;
  evidence: string;
  reasoning: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    units: 'normalized';
  };
}

interface ChatFrameVisualVerificationInput {
  query: string;
  evidence: ChatFrameEvidence;
  candidateContext?: string;
}

interface ChatFrameVisualVerificationDependencies {
  generate?: (parts: ReturnType<typeof buildGeminiHumanParts>) => Promise<string>;
  model?: string;
}

const VERIFICATION_TIMEOUT_MS = 25_000;
const MAX_TEXT_LENGTH = 500;
const FRAME_QUERY_PREFIX = 'Verify canonical visual match for:';

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    targetVisible: { type: SchemaType.BOOLEAN },
    matchQuality: { type: SchemaType.STRING },
    evidence: { type: SchemaType.STRING },
    reasoning: { type: SchemaType.STRING },
    boundingBox: {
      type: SchemaType.OBJECT,
      properties: {
        x: { type: SchemaType.NUMBER },
        y: { type: SchemaType.NUMBER },
        width: { type: SchemaType.NUMBER },
        height: { type: SchemaType.NUMBER },
      },
      required: ['x', 'y', 'width', 'height'],
    },
  },
  required: ['targetVisible', 'matchQuality', 'evidence', 'reasoning'],
};

export async function verifyChatFrameVisualMatch(
  input: ChatFrameVisualVerificationInput,
  dependencies: ChatFrameVisualVerificationDependencies = {},
): Promise<ChatFrameVisualVerification> {
  const query = bindQueryToInspectionEvidence(input.query, input.evidence.question);
  const parts = buildGeminiHumanParts(buildVerificationPrompt(query, input.candidateContext), input.evidence);
  const model = dependencies.model ?? ANALYSIS_MODEL_NAME;
  const responseText = await withTimeout(
    dependencies.generate
      ? dependencies.generate(parts)
      : generateWithGemini(parts),
    VERIFICATION_TIMEOUT_MS,
  );
  const parsed = parseVerificationResponse(responseText);
  const confirmed = parsed.targetVisible
    && (parsed.matchQuality === 'exact' || parsed.matchQuality === 'clear-semantic');
  const boundingBox = confirmed ? readNormalizedBoundingBox(parsed.boundingBox) : undefined;
  const receiptId = buildReceiptId({
    query,
    frame: input.evidence.frame,
    capturedAtMs: input.evidence.capturedAtMs,
    matchQuality: parsed.matchQuality,
    evidence: parsed.evidence,
  });

  return {
    status: confirmed ? 'confirmed' : 'rejected',
    receiptId,
    frame: input.evidence.frame,
    query,
    provider: 'gemini',
    model,
    matchQuality: parsed.matchQuality,
    evidence: boundedText(parsed.evidence, MAX_TEXT_LENGTH),
    reasoning: boundedText(parsed.reasoning, MAX_TEXT_LENGTH),
    ...(boundingBox ? { boundingBox } : {}),
  };
}

function buildVerificationPrompt(query: string, candidateContext?: string): string {
  return [
    '<role>You are a strict visual-grounding verifier for a video editor.</role>',
    '<task>Decide whether the target is directly visible in this single editor-rendered frame.</task>',
    `<target>${JSON.stringify(query)}</target>`,
    candidateContext
      ? `<retrieval_hint>${JSON.stringify(boundedText(candidateContext, MAX_TEXT_LENGTH))}</retrieval_hint>`
      : '',
    '<rules>',
    '1. Judge pixels only. The retrieval hint is a search hint, never proof.',
    '2. exact means the literal target is plainly visible.',
    '3. clear-semantic means the same object/action is plainly visible despite different wording.',
    '4. partial means only a related object, uncertain action, or incomplete target is visible.',
    '5. absent means the target is not visible.',
    '6. targetVisible may be true only for exact or clear-semantic.',
    '7. If the target is visible and spatially localizable, return one tight normalized 0..1 bounding box.',
    '8. Do not infer events outside this frame. Do not use transcript or metadata as visual evidence.',
    '</rules>',
    '<output>Return only schema-valid JSON.</output>',
  ].filter(Boolean).join('\n');
}

async function generateWithGemini(
  parts: ReturnType<typeof buildGeminiHumanParts>,
): Promise<string> {
  const model = await getAnalysisModel();
  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
      seed: 42,
      maxOutputTokens: 768,
    },
  });
  return result.response?.text?.() ?? '';
}

function bindQueryToInspectionEvidence(query: string, question: string): string {
  const bound = question.startsWith(FRAME_QUERY_PREFIX)
    ? question.slice(FRAME_QUERY_PREFIX.length).trim()
    : '';
  if (!bound) return boundedText(query, MAX_TEXT_LENGTH);
  if (normalizeText(bound) !== normalizeText(query)) {
    throw new Error('Attached frame evidence belongs to a different visual query.');
  }
  return boundedText(bound, MAX_TEXT_LENGTH);
}

function parseVerificationResponse(text: string): {
  targetVisible: boolean;
  matchQuality: ChatFrameVisualMatchQuality;
  evidence: string;
  reasoning: string;
  boundingBox?: unknown;
} {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('Visual verification provider returned invalid JSON.');
  }
  if (!isRecord(parsed)) throw new Error('Visual verification provider returned a non-object response.');
  const matchQuality = parsed.matchQuality;
  if (!isMatchQuality(matchQuality)) {
    throw new Error('Visual verification provider returned an invalid match quality.');
  }
  if (typeof parsed.targetVisible !== 'boolean') {
    throw new Error('Visual verification provider omitted targetVisible.');
  }
  if (parsed.targetVisible && matchQuality !== 'exact' && matchQuality !== 'clear-semantic') {
    throw new Error('Visual verification provider returned a contradictory visibility verdict.');
  }
  return {
    targetVisible: parsed.targetVisible,
    matchQuality,
    evidence: requiredText(parsed.evidence, 'evidence'),
    reasoning: requiredText(parsed.reasoning, 'reasoning'),
    boundingBox: parsed.boundingBox,
  };
}

function readNormalizedBoundingBox(value: unknown): ChatFrameVisualVerification['boundingBox'] {
  if (!isRecord(value)) return undefined;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  if (x == null || y == null || width == null || height == null) return undefined;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
    return undefined;
  }
  return { x, y, width, height, units: 'normalized' };
}

function buildReceiptId(input: {
  query: string;
  frame: number;
  capturedAtMs: number;
  matchQuality: ChatFrameVisualMatchQuality;
  evidence: string;
}): string {
  const digest = createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 24);
  return `frame-visual-${digest}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Visual verification provider timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function boundedText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function requiredText(value: unknown, field: string): string {
  const text = boundedText(value, MAX_TEXT_LENGTH);
  if (!text) throw new Error(`Visual verification provider omitted ${field}.`);
  return text;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isMatchQuality(value: unknown): value is ChatFrameVisualMatchQuality {
  return value === 'exact' || value === 'clear-semantic' || value === 'partial' || value === 'absent';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
