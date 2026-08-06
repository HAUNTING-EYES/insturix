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
  frames: number[];
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
  generate?: (
    parts: ReturnType<typeof buildGeminiHumanParts>,
    attempt: number,
  ) => Promise<string>;
  model?: string;
}

const VERIFICATION_TIMEOUT_MS = 25_000;
const VERIFICATION_MAX_ATTEMPTS = 2;
const VERIFICATION_MAX_OUTPUT_TOKENS = 4_096;
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
  const frames = evidenceFrameNumbers(input.evidence);
  const parts = buildGeminiHumanParts(
    buildVerificationPrompt(query, input.candidateContext, frames.length > 1),
    input.evidence,
  );
  const model = dependencies.model ?? ANALYSIS_MODEL_NAME;
  const parsed = await generateVerifiedResponse(parts, dependencies);
  const confirmed = parsed.targetVisible
    && (parsed.matchQuality === 'exact' || parsed.matchQuality === 'clear-semantic');
  const boundingBox = confirmed ? readNormalizedBoundingBox(parsed.boundingBox) : undefined;
  const receiptId = buildReceiptId({
    query,
    frames,
    capturedAtMs: input.evidence.capturedAtMs,
    matchQuality: parsed.matchQuality,
    evidence: parsed.evidence,
  });

  return {
    status: confirmed ? 'confirmed' : 'rejected',
    receiptId,
    frame: input.evidence.frame,
    frames,
    query,
    provider: 'gemini',
    model,
    matchQuality: parsed.matchQuality,
    evidence: boundedText(parsed.evidence, MAX_TEXT_LENGTH),
    reasoning: boundedText(parsed.reasoning, MAX_TEXT_LENGTH),
    ...(boundingBox ? { boundingBox } : {}),
  };
}

function buildVerificationPrompt(
  query: string,
  candidateContext: string | undefined,
  temporal: boolean,
): string {
  return [
    '<role>You are a strict visual-grounding verifier for a video editor.</role>',
    temporal
      ? '<task>Decide whether the target event or motion is directly demonstrated by this chronological sequence of editor-rendered frames.</task>'
      : '<task>Decide whether the target is directly visible in this single editor-rendered frame.</task>',
    `<target>${JSON.stringify(query)}</target>`,
    candidateContext
      ? `<retrieval_hint>${JSON.stringify(boundedText(candidateContext, MAX_TEXT_LENGTH))}</retrieval_hint>`
      : '',
    '<rules>',
    '1. Judge pixels only. The retrieval hint is a search hint, never proof.',
    temporal
      ? '2. The frames are ordered by edited-timeline time. Confirm motion only when visible change across them establishes the requested event.'
      : '2. A single frame can confirm visible objects, states, and poses, but not motion over time.',
    '3. exact means the literal target is plainly demonstrated by the supplied pixels.',
    '4. clear-semantic means the same object/action is plainly demonstrated despite different wording.',
    '5. partial means only a related object, uncertain action, or incomplete target is visible.',
    '6. absent means the target is not visible or the supplied frames cannot establish it.',
    '7. targetVisible may be true only for exact or clear-semantic.',
    '8. If the target is visible and spatially localizable at the anchor frame, return one tight normalized 0..1 bounding box.',
    temporal
      ? '9. Do not infer motion before, between, or after the supplied frames. Do not use transcript or metadata as visual evidence.'
      : '9. Do not infer events outside this frame. Do not use transcript or metadata as visual evidence.',
    '</rules>',
    '<output>Return only schema-valid JSON.</output>',
  ].filter(Boolean).join('\n');
}

async function generateWithGemini(
  parts: ReturnType<typeof buildGeminiHumanParts>,
  attempt: number,
): Promise<string> {
  const model = await getAnalysisModel();
  const retryInstruction = attempt > 1
    ? [{ text: 'The previous provider response was not schema-valid. Return the required JSON object now, with no prose or code fence.' }]
    : [];
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [...parts, ...retryInstruction] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
      seed: 41 + attempt,
      maxOutputTokens: VERIFICATION_MAX_OUTPUT_TOKENS,
    },
  });
  return result.response?.text?.() ?? '';
}

async function generateVerifiedResponse(
  parts: ReturnType<typeof buildGeminiHumanParts>,
  dependencies: ChatFrameVisualVerificationDependencies,
): Promise<ReturnType<typeof parseVerificationResponse>> {
  const deadline = Date.now() + VERIFICATION_TIMEOUT_MS;
  const diagnostics: string[] = [];

  for (let attempt = 1; attempt <= VERIFICATION_MAX_ATTEMPTS; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const responseText = await withTimeout(
      dependencies.generate
        ? dependencies.generate(parts, attempt)
        : generateWithGemini(parts, attempt),
      remainingMs,
    );
    try {
      return parseVerificationResponse(responseText);
    } catch (error) {
      diagnostics.push(formatMalformedResponseDiagnostic(attempt, responseText, error));
    }
  }

  throw new Error(
    `Visual verification provider returned invalid structured output after ${diagnostics.length} attempt(s): ${diagnostics.join(' | ') || 'deadline exhausted'}`,
  );
}

function formatMalformedResponseDiagnostic(
  attempt: number,
  responseText: string,
  error: unknown,
): string {
  const fingerprint = createHash('sha256').update(responseText).digest('hex').slice(0, 12);
  const reason = error instanceof Error ? error.message : String(error);
  return `attempt=${attempt},chars=${responseText.length},sha256=${fingerprint},reason=${boundedText(reason, 160)}`;
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
  frames: number[];
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

function evidenceFrameNumbers(evidence: ChatFrameEvidence): number[] {
  return [evidence.frame, ...(evidence.contextFrames ?? []).map((sample) => sample.frame)]
    .sort((left, right) => left - right);
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
