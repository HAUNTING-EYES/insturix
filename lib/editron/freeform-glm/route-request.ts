export type JsonRecord = Record<string, unknown>;
export type FreeformOperation = 'generateScene' | 'editElement';

export interface GenerateSceneRouteInput {
  operation: 'generateScene';
  brief: string;
  brandContext?: string;
  projectContext?: string;
  filename: string;
  maxRepairAttempts: number;
  minJsxElements?: number;
  maxLines?: number;
}

export interface EditElementRouteInput {
  operation: 'editElement';
  elementCode: string;
  instruction: string;
  marker: {
    eid: string;
    sourceLoc: string;
  };
  expectedTagName?: string;
  allowTagChange?: boolean;
  brandContext?: string;
  projectContext?: string;
  filename: string;
  maxRepairAttempts: number;
}

export type ParsedFreeformRequest =
  | { ok: true; data: GenerateSceneRouteInput | EditElementRouteInput }
  | { ok: false; error: string; details?: string[] };

export type ParsedJson =
  | { ok: true; value: JsonRecord }
  | { ok: false; error: string };

interface JsonRequest {
  json(): Promise<unknown>;
}

const DEFAULT_FILENAME = 'FreeformScene.tsx';
const MAX_BRIEF_LENGTH = 4_000;
const MAX_BRAND_CONTEXT_LENGTH = 6_000;
const MAX_PROJECT_CONTEXT_LENGTH = 6_000;
const MAX_ELEMENT_CODE_LENGTH = 15_000;
const MAX_INSTRUCTION_LENGTH = 2_000;
const MAX_MARKER_LENGTH = 240;

export async function readJsonObject(request: JsonRequest): Promise<ParsedJson> {
  try {
    const value = await request.json();
    if (!isRecord(value)) return { ok: false, error: 'Request body must be a JSON object.' };
    return { ok: true, value };
  } catch (_error) {
    return { ok: false, error: 'Invalid JSON.' };
  }
}

export function parseFreeformRequest(body: JsonRecord): ParsedFreeformRequest {
  const operation = readString(body, 'operation');
  if (operation !== 'generateScene' && operation !== 'editElement') {
    return fail('operation must be "generateScene" or "editElement".');
  }

  return operation === 'generateScene'
    ? parseGenerateSceneRequest(body, operation)
    : parseEditElementRequest(body, operation);
}

export function isFreeformGlmEnabled(): boolean {
  const flag = process.env.EDITRON_FREEFORM_GLM_ENABLED?.toLowerCase();
  if (flag === 'false' || flag === '0') return false;
  if (process.env.NODE_ENV === 'production') return flag === 'true' || flag === '1';
  return true;
}

function parseGenerateSceneRequest(
  body: JsonRecord,
  operation: FreeformOperation,
): ParsedFreeformRequest {
  const errors: string[] = [];
  const brief = requireBoundedString(body, 'brief', MAX_BRIEF_LENGTH, errors);
  const brandContext = optionalBoundedString(body, 'brandContext', MAX_BRAND_CONTEXT_LENGTH, errors);
  const projectContext = optionalBoundedString(body, 'projectContext', MAX_PROJECT_CONTEXT_LENGTH, errors);
  const filename = readFilename(body, errors);
  const maxRepairAttempts = readBoundedInteger(body, 'maxRepairAttempts', 1, 0, 1, errors);
  const minJsxElements = readOptionalBoundedInteger(body, 'minJsxElements', 1, 60, errors);
  const maxLines = readOptionalBoundedInteger(body, 'maxLines', 20, 300, errors);

  if (!brief || errors.length > 0) {
    return fail('Invalid generateScene request.', errors);
  }

  return {
    ok: true,
    data: {
      operation: operation as 'generateScene',
      brief,
      brandContext,
      projectContext,
      filename,
      maxRepairAttempts,
      minJsxElements,
      maxLines,
    },
  };
}

function parseEditElementRequest(
  body: JsonRecord,
  operation: FreeformOperation,
): ParsedFreeformRequest {
  const errors: string[] = [];
  const elementCode = requireBoundedString(body, 'elementCode', MAX_ELEMENT_CODE_LENGTH, errors);
  const instruction = requireBoundedString(body, 'instruction', MAX_INSTRUCTION_LENGTH, errors);
  const marker = readMarker(body, errors);
  const filename = readFilename(body, errors);
  const expectedTagName = optionalTagName(body, 'expectedTagName', errors);
  const allowTagChange = typeof body.allowTagChange === 'boolean' ? body.allowTagChange : undefined;
  const brandContext = optionalBoundedString(body, 'brandContext', MAX_BRAND_CONTEXT_LENGTH, errors);
  const projectContext = optionalBoundedString(body, 'projectContext', MAX_PROJECT_CONTEXT_LENGTH, errors);
  const maxRepairAttempts = readBoundedInteger(body, 'maxRepairAttempts', 1, 0, 1, errors);

  if (!elementCode || !instruction || !marker || errors.length > 0) {
    return fail('Invalid editElement request.', errors);
  }

  return {
    ok: true,
    data: {
      operation: operation as 'editElement',
      elementCode,
      instruction,
      marker,
      expectedTagName,
      allowTagChange,
      brandContext,
      projectContext,
      filename,
      maxRepairAttempts,
    },
  };
}

function requireBoundedString(
  body: JsonRecord,
  key: string,
  maxLength: number,
  errors: string[],
): string | undefined {
  const value = readString(body, key)?.trim();
  if (!value) {
    errors.push(`${key} is required.`);
    return undefined;
  }
  if (value.length > maxLength) {
    errors.push(`${key} must be ${maxLength} characters or less.`);
    return undefined;
  }
  return value;
}

function optionalBoundedString(
  body: JsonRecord,
  key: string,
  maxLength: number,
  errors: string[],
): string | undefined {
  const value = readString(body, key);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) errors.push(`${key} must be ${maxLength} characters or less.`);
  return trimmed || undefined;
}

function readMarker(
  body: JsonRecord,
  errors: string[],
): { eid: string; sourceLoc: string } | undefined {
  if (!isRecord(body.marker)) {
    errors.push('marker is required.');
    return undefined;
  }

  const eid = requireBoundedString(body.marker, 'eid', MAX_MARKER_LENGTH, errors);
  const sourceLoc = requireBoundedString(body.marker, 'sourceLoc', MAX_MARKER_LENGTH, errors);
  return eid && sourceLoc ? { eid, sourceLoc } : undefined;
}

function readFilename(body: JsonRecord, errors: string[]): string {
  const filename = optionalBoundedString(body, 'filename', 80, errors) ?? DEFAULT_FILENAME;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,75}\.tsx$/i.test(filename)) {
    errors.push('filename must be a simple .tsx basename.');
    return DEFAULT_FILENAME;
  }
  return filename;
}

function optionalTagName(body: JsonRecord, key: string, errors: string[]): string | undefined {
  const tagName = optionalBoundedString(body, key, 80, errors);
  if (tagName && !/^[A-Za-z][A-Za-z0-9.]*$/.test(tagName)) {
    errors.push(`${key} must be a JSX tag name.`);
    return undefined;
  }
  return tagName;
}

function readBoundedInteger(
  body: JsonRecord,
  key: string,
  fallback: number,
  min: number,
  max: number,
  errors: string[],
): number {
  const value = body[key];
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || typeof value !== 'number' || value < min || value > max) {
    errors.push(`${key} must be an integer from ${min} to ${max}.`);
    return fallback;
  }
  return value;
}

function readOptionalBoundedInteger(
  body: JsonRecord,
  key: string,
  min: number,
  max: number,
  errors: string[],
): number | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || typeof value !== 'number' || value < min || value > max) {
    errors.push(`${key} must be an integer from ${min} to ${max}.`);
    return undefined;
  }
  return value;
}

function readString(body: JsonRecord, key: string): string | undefined {
  return typeof body[key] === 'string' ? body[key] : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(error: string, details?: string[]): ParsedFreeformRequest {
  return { ok: false, error, details };
}