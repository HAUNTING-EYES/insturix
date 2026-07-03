import * as ts from 'typescript';

import {
  buildFreeformElementMap,
  parseFreeformTsx,
} from '../freeform-trace/instrument';
import {
  createOllamaFreeformClient,
  findDangerousFreeformTsx,
  formatDiagnostics,
  FreeformGlmClient,
  FreeformGlmDiagnostic,
  stripCodeFence,
} from './ollama-client';
import {
  buildFreeformContextPack,
  formatFreeformContextPack,
  type FreeformContextPack,
  type FreeformContextPackSummary,
} from './context-pack';

export interface FreeformSceneGenerationInput {
  brief: string;
  brandContext?: string;
  projectContext?: string;
  filename?: string;
  maxRepairAttempts?: number;
  minJsxElements?: number;
  maxLines?: number;
  contextPack?: FreeformContextPack;
}

export interface FreeformSceneValidation {
  ok: boolean;
  diagnostics: FreeformGlmDiagnostic[];
  elementCount: number;
  facts: FreeformSceneFacts;
}

export interface FreeformSceneFacts {
  hasRemotionImport: boolean;
  hasExportedComponent: boolean;
  usesFrame: boolean;
  usesConfig: boolean;
  usesAnimationPrimitive: boolean;
  usesSequencePrimitive: boolean;
}

export type FreeformSceneGenerationResult =
  | {
    ok: true;
    code: string;
    attempts: number;
    repaired: boolean;
    validation: FreeformSceneValidation;
    context: FreeformContextPackSummary;
  }
  | {
    ok: false;
    reason: string;
    attempts: number;
    diagnostics: FreeformGlmDiagnostic[];
    context: FreeformContextPackSummary;
    rawCode?: string;
  };

const DEFAULT_MIN_JSX_ELEMENTS = 6;
const DEFAULT_MAX_LINES = 220;

export async function generateFreeformRemotionScene(
  input: FreeformSceneGenerationInput,
  client: FreeformGlmClient = createOllamaFreeformClient(),
): Promise<FreeformSceneGenerationResult> {
  const maxRepairAttempts = input.maxRepairAttempts ?? 1;
  const contextPack = input.contextPack ?? buildFreeformContextPack({
    operation: 'generateScene',
    brief: input.brief,
    brandContext: input.brandContext,
    projectContext: input.projectContext,
    filename: input.filename,
  });
  let attempts = 0;
  let rawCode = '';
  let validation: FreeformSceneValidation | null = null;

  const firstResponse = await client.chatCode({
    messages: buildSceneMessages(input, contextPack),
    temperature: 0.2,
    numPredict: 2_400,
  });
  attempts += 1;

  if (!firstResponse.ok) {
    return requestFailure(firstResponse.error, attempts, contextPack.summary);
  }

  rawCode = stripCodeFence(firstResponse.content);
  validation = validateGeneratedScene(rawCode, input);
  if (validation.ok) {
    return { ok: true, code: rawCode, attempts, repaired: false, validation, context: contextPack.summary };
  }

  for (let repairIndex = 0; repairIndex < maxRepairAttempts; repairIndex += 1) {
    const repairResponse = await client.chatCode({
      messages: buildRepairMessages(input, rawCode, validation.diagnostics, contextPack),
      temperature: 0.05,
      numPredict: 2_400,
    });
    attempts += 1;

    if (!repairResponse.ok) {
      return {
        ok: false,
        reason: repairResponse.error,
        attempts,
        rawCode,
        context: contextPack.summary,
        diagnostics: [
          {
            code: 'glm_request_failed',
            severity: 'error',
            message: repairResponse.error,
          },
          ...validation.diagnostics,
        ],
      };
    }

    rawCode = stripCodeFence(repairResponse.content);
    validation = validateGeneratedScene(rawCode, input);
    if (validation.ok) {
      return { ok: true, code: rawCode, attempts, repaired: true, validation, context: contextPack.summary };
    }
  }

  return {
    ok: false,
    reason: 'GLM scene output failed validation after repair.',
    attempts,
    diagnostics: validation.diagnostics,
    context: contextPack.summary,
    rawCode,
  };
}

export function validateGeneratedScene(
  code: string,
  options: Pick<FreeformSceneGenerationInput, 'filename' | 'minJsxElements' | 'maxLines'> = {},
): FreeformSceneValidation {
  const filename = options.filename ?? 'Scene.tsx';
  const minJsxElements = options.minJsxElements ?? DEFAULT_MIN_JSX_ELEMENTS;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const diagnostics: FreeformGlmDiagnostic[] = [
    ...findDangerousFreeformTsx(code),
  ];
  const lineCount = code.split(/\r\n|\r|\n/).length;

  if (lineCount > maxLines) {
    diagnostics.push({
      code: 'too_many_lines',
      severity: 'error',
      message: `Generated scene has ${lineCount} lines; max is ${maxLines}.`,
    });
  }

  if (/\bdata-(?:eid|source-loc)\b/.test(code)) {
    diagnostics.push({
      code: 'model_owned_trace_attrs',
      severity: 'error',
      message: 'Generated scenes may not write data-eid or data-source-loc; tracing is injected by the AST layer.',
    });
  }

  const sourceFile = parseScene(code, filename, diagnostics);
  let elementCount = 0;
  let facts: FreeformSceneFacts = emptySceneFacts();

  if (sourceFile) {
    facts = collectSceneFacts(sourceFile);
    elementCount = countTraceableElements(code, filename, diagnostics);
    if (elementCount < minJsxElements) {
      diagnostics.push({
        code: 'too_few_jsx_elements',
        severity: 'error',
        message: `Generated scene needs at least ${minJsxElements} traceable JSX elements; found ${elementCount}.`,
      });
    }

    if (!facts.hasRemotionImport) {
      diagnostics.push({
        code: 'missing_remotion_import',
        severity: 'error',
        message: 'Generated scene must import Remotion primitives from the remotion package.',
      });
    }
    if (!facts.hasExportedComponent) {
      diagnostics.push({
        code: 'missing_exported_component',
        severity: 'error',
        message: 'Generated scene must export a PascalCase React component.',
      });
    }
    if (!facts.usesFrame) {
      diagnostics.push({
        code: 'missing_use_current_frame',
        severity: 'error',
        message: 'Generated scene must use useCurrentFrame().',
      });
    }
    if (!facts.usesConfig) {
      diagnostics.push({
        code: 'missing_use_video_config',
        severity: 'error',
        message: 'Generated scene must use useVideoConfig().',
      });
    }
    if (!facts.usesAnimationPrimitive) {
      diagnostics.push({
        code: 'missing_animation_primitive',
        severity: 'error',
        message: 'Generated scene must use interpolate() or spring().',
      });
    }
    if (!facts.usesSequencePrimitive) {
      diagnostics.push({
        code: 'missing_sequence_primitive',
        severity: 'error',
        message: 'Generated scene must use Sequence or Series.',
      });
    }
  }

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
    elementCount,
    facts,
  };
}

function buildSceneMessages(
  input: FreeformSceneGenerationInput,
  contextPack: FreeformContextPack,
) {
  return [
    {
      role: 'system' as const,
      content: [
        'You write production Remotion TSX for Editron freeform previews.',
        'Use the context pack as grounding, but never mention it in output.',
        'Return ONLY a complete TSX file. No markdown, no prose.',
        'Import needed primitives from remotion.',
        'Export one PascalCase component.',
        'Use useCurrentFrame(), useVideoConfig(), and interpolate() or spring().',
        'Use Sequence or Series for staged timing.',
        'Do not use network calls, browser globals, storage, eval, dynamic imports, or external assets.',
        'Do not write data-eid or data-source-loc. The AST trace layer owns those attributes.',
        'Keep the file compact and deterministic.',
        formatFreeformContextPack(contextPack),
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: [
        `Scene brief: ${input.brief}`,
        input.brandContext ? `Brand context: ${input.brandContext}` : null,
        input.projectContext ? `Project context: ${input.projectContext}` : null,
        `Filename: ${input.filename ?? 'Scene.tsx'}`,
      ].filter(Boolean).join('\n'),
    },
  ];
}

function buildRepairMessages(
  input: FreeformSceneGenerationInput,
  code: string,
  diagnostics: readonly FreeformGlmDiagnostic[],
  contextPack: FreeformContextPack,
) {
  return [
    {
      role: 'system' as const,
      content: [
        'Repair this Remotion TSX file so it passes validation.',
        'Return ONLY the corrected complete TSX file. No markdown, no prose.',
        'Do not add data-eid or data-source-loc.',
        'Preserve the creative intent from the context pack while fixing the deterministic contract.',
        formatFreeformContextPack(contextPack),
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: [
        `Original brief: ${input.brief}`,
        'Validation diagnostics:',
        formatDiagnostics(diagnostics),
        'Code:',
        code,
      ].join('\n'),
    },
  ];
}

function requestFailure(
  reason: string,
  attempts: number,
  context: FreeformContextPackSummary,
): FreeformSceneGenerationResult {
  return {
    ok: false,
    reason,
    attempts,
    context,
    diagnostics: [{
      code: 'glm_request_failed',
      severity: 'error',
      message: reason,
    }],
  };
}

function parseScene(
  code: string,
  filename: string,
  diagnostics: FreeformGlmDiagnostic[],
): ts.SourceFile | null {
  try {
    return parseFreeformTsx(code, filename);
  } catch (error) {
    diagnostics.push({
      code: 'invalid_tsx',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function countTraceableElements(
  code: string,
  filename: string,
  diagnostics: FreeformGlmDiagnostic[],
): number {
  try {
    return buildFreeformElementMap(code, { filename }).length;
  } catch (error) {
    diagnostics.push({
      code: 'element_map_failed',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

function collectSceneFacts(sourceFile: ts.SourceFile): FreeformSceneFacts {
  const facts = emptySceneFacts();
  const identifiers = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'remotion'
    ) {
      facts.hasRemotionImport = true;
    }

    if (isExportedPascalCaseComponent(statement)) {
      facts.hasExportedComponent = true;
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  facts.usesFrame = identifiers.has('useCurrentFrame');
  facts.usesConfig = identifiers.has('useVideoConfig');
  facts.usesAnimationPrimitive = identifiers.has('interpolate') || identifiers.has('spring');
  facts.usesSequencePrimitive = identifiers.has('Sequence') || identifiers.has('Series');
  return facts;
}

function isExportedPascalCaseComponent(statement: ts.Statement): boolean {
  if (ts.isFunctionDeclaration(statement)) {
    return hasExportModifier(statement) && isPascalCaseName(statement.name?.text);
  }

  if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) return false;
  return statement.declarationList.declarations.some((declaration) => (
    ts.isIdentifier(declaration.name) &&
    isPascalCaseName(declaration.name.text) &&
    Boolean(declaration.initializer)
  ));
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export);
}

function isPascalCaseName(value: string | undefined): boolean {
  return Boolean(value && /^[A-Z][A-Za-z0-9]*$/.test(value));
}

function emptySceneFacts(): FreeformSceneFacts {
  return {
    hasRemotionImport: false,
    hasExportedComponent: false,
    usesFrame: false,
    usesConfig: false,
    usesAnimationPrimitive: false,
    usesSequencePrimitive: false,
  };
}
