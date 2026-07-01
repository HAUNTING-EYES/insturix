export type FreeformGlmDiagnosticSeverity = 'error' | 'warning';

export interface FreeformGlmDiagnostic {
  code: string;
  message: string;
  severity: FreeformGlmDiagnosticSeverity;
  line?: number;
  column?: number;
}

export interface FreeformGlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface FreeformGlmChatRequest {
  messages: readonly FreeformGlmChatMessage[];
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
}

export type FreeformGlmChatResult =
  | {
    ok: true;
    content: string;
    raw: unknown;
    doneReason?: string;
    thinkingPreview?: string;
  }
  | {
    ok: false;
    error: string;
    status?: number;
    raw?: unknown;
  };

export interface FreeformGlmClient {
  chatCode(request: FreeformGlmChatRequest): Promise<FreeformGlmChatResult>;
}

export type FetchLike = typeof fetch;

export interface OllamaFreeformClientOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  numPredict?: number;
  fetchImpl?: FetchLike;
}

interface OllamaChatPayload {
  model: string;
  stream: false;
  think: false;
  messages: readonly FreeformGlmChatMessage[];
  options: {
    temperature: number;
    num_predict: number;
  };
}

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_NUM_PREDICT = 2_400;

const DANGEROUS_TSX_PATTERNS: Array<{
  code: string;
  label: string;
  pattern: RegExp;
}> = [
  { code: 'network_fetch', label: 'fetch()', pattern: /\bfetch\s*\(/ },
  { code: 'xml_http_request', label: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { code: 'websocket', label: 'WebSocket', pattern: /\bWebSocket\b/ },
  { code: 'browser_storage', label: 'localStorage/sessionStorage', pattern: /\b(?:localStorage|sessionStorage)\b/ },
  { code: 'browser_cookie', label: 'document.cookie', pattern: /\bdocument\s*\.\s*cookie\b/ },
  { code: 'browser_global', label: 'window/document globals', pattern: /\b(?:window|document)\s*\./ },
  { code: 'process_env', label: 'process.env', pattern: /\bprocess\s*\.\s*env\b/ },
  { code: 'eval', label: 'eval()', pattern: /\beval\s*\(/ },
  { code: 'function_constructor', label: 'Function()', pattern: /\bFunction\s*\(/ },
  { code: 'dynamic_import', label: 'dynamic import()', pattern: /\bimport\s*\(/ },
  { code: 'commonjs_require', label: 'require()', pattern: /\brequire\s*\(/ },
  { code: 'dangerous_html', label: 'dangerouslySetInnerHTML', pattern: /\bdangerouslySetInnerHTML\b/ },
  { code: 'active_embed', label: 'iframe/script/embed/object', pattern: /<\s*(?:iframe|script|embed|object)\b/i },
];

export function createOllamaFreeformClient(
  options: OllamaFreeformClientOptions = {},
): FreeformGlmClient {
  return new OllamaFreeformClient(options);
}

export class OllamaFreeformClient implements FreeformGlmClient {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly numPredict: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: OllamaFreeformClientOptions = {}) {
    this.endpoint = options.endpoint ?? envValue('EDITRON_OLLAMA_ENDPOINT') ?? DEFAULT_ENDPOINT;
    this.model = options.model
      ?? envValue('EDITRON_FREEFORM_GLM_MODEL')
      ?? envValue('GLM_OLLAMA_MODEL')
      ?? 'glm-5.1:cloud';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    this.numPredict = options.numPredict ?? DEFAULT_NUM_PREDICT;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chatCode(request: FreeformGlmChatRequest): Promise<FreeformGlmChatResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? this.timeoutMs);
    const payload: OllamaChatPayload = {
      model: this.model,
      stream: false,
      think: false,
      messages: request.messages,
      options: {
        temperature: request.temperature ?? this.temperature,
        num_predict: request.numPredict ?? this.numPredict,
      },
    };

    try {
      const response = await this.fetchImpl(chatUrl(this.endpoint), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const raw = await readJsonSafely(response);

      if (!response.ok) {
        return {
          ok: false,
          error: `Ollama chat failed with HTTP ${response.status}.`,
          status: response.status,
          raw,
        };
      }

      const content = readContent(raw);
      if (!content.trim()) {
        return {
          ok: false,
          error: 'Ollama returned an empty code response.',
          status: response.status,
          raw,
        };
      }

      return {
        ok: true,
        content: stripCodeFence(content),
        raw,
        doneReason: readString(raw, 'done_reason'),
        thinkingPreview: readThinking(raw)?.slice(0, 320),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error && error.name === 'AbortError'
          ? 'Ollama chat timed out.'
          : `Ollama chat failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const fullFence = trimmed.match(/^```(?:tsx|typescript|ts|jsx|javascript|js)?\s*([\s\S]*?)\s*```$/i);
  if (fullFence) return fullFence[1].trim();

  const firstFence = trimmed.match(/```(?:tsx|typescript|ts|jsx|javascript|js)?\s*([\s\S]*?)\s*```/i);
  return (firstFence?.[1] ?? trimmed).trim();
}

export function findDangerousFreeformTsx(code: string): FreeformGlmDiagnostic[] {
  return DANGEROUS_TSX_PATTERNS.flatMap((entry) => {
    const match = entry.pattern.exec(code);
    if (!match || typeof match.index !== 'number') return [];
    const loc = indexToLineColumn(code, match.index);
    return [{
      code: `dangerous_${entry.code}`,
      severity: 'error' as const,
      message: `Generated TSX may not use ${entry.label}.`,
      line: loc.line,
      column: loc.column,
    }];
  });
}

export function formatDiagnostics(diagnostics: readonly FreeformGlmDiagnostic[]): string {
  return diagnostics
    .map((diagnostic) => {
      const loc = diagnostic.line ? ` at ${diagnostic.line}:${diagnostic.column ?? 0}` : '';
      return `- ${diagnostic.code}${loc}: ${diagnostic.message}`;
    })
    .join('\n');
}

function chatUrl(endpoint: string): string {
  const normalized = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  return new URL('api/chat', normalized).toString();
}

function envValue(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env[name];
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function readContent(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const message = payload.message;
  if (isRecord(message) && typeof message.content === 'string') return message.content;
  if (typeof payload.response === 'string') return payload.response;
  return '';
}

function readThinking(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const message = payload.message;
  return isRecord(message) && typeof message.thinking === 'string'
    ? message.thinking
    : undefined;
}

function readString(payload: unknown, key: string): string | undefined {
  return isRecord(payload) && typeof payload[key] === 'string' ? payload[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function indexToLineColumn(text: string, index: number): { line: number; column: number } {
  const prefix = text.slice(0, index);
  const lines = prefix.split(/\r\n|\r|\n/);
  return {
    line: lines.length,
    column: lines[lines.length - 1].length,
  };
}
