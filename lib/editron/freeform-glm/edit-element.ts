import * as ts from 'typescript';

import { parseFreeformTsx } from '../freeform-trace/instrument';
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

export interface FreeformTraceMarker {
  eid: string;
  sourceLoc: string;
}

export interface FreeformElementEditInput {
  elementCode: string;
  instruction: string;
  marker: FreeformTraceMarker;
  expectedTagName?: string;
  allowTagChange?: boolean;
  brandContext?: string;
  projectContext?: string;
  filename?: string;
  maxRepairAttempts?: number;
  contextPack?: FreeformContextPack;
}

export interface FreeformElementEditValidation {
  ok: boolean;
  diagnostics: FreeformGlmDiagnostic[];
  rootTagName?: string;
}

export type FreeformElementEditResult =
  | {
    ok: true;
    code: string;
    attempts: number;
    repaired: boolean;
    validation: FreeformElementEditValidation;
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

export async function editTracedElementWithGlm(
  input: FreeformElementEditInput,
  client: FreeformGlmClient = createOllamaFreeformClient(),
): Promise<FreeformElementEditResult> {
  const maxRepairAttempts = input.maxRepairAttempts ?? 1;
  const contextPack = input.contextPack ?? buildFreeformContextPack({
    operation: 'editElement',
    filename: input.filename,
    brandContext: input.brandContext,
    projectContext: input.projectContext,
    selectedElementCode: input.elementCode,
    selectedElementMarker: input.marker,
    selectedElementTagName: input.expectedTagName,
    allowTagChange: input.allowTagChange,
  });
  let attempts = 0;
  let rawCode = '';
  let validation: FreeformElementEditValidation | null = null;

  const firstResponse = await client.chatCode({
    messages: buildEditMessages(input, contextPack),
    temperature: 0.1,
    numPredict: 1_200,
  });
  attempts += 1;

  if (!firstResponse.ok) return requestFailure(firstResponse.error, attempts, contextPack.summary);

  rawCode = stripCodeFence(firstResponse.content);
  validation = validateTracedElementEdit(rawCode, input);
  if (validation.ok) {
    return { ok: true, code: rawCode, attempts, repaired: false, validation, context: contextPack.summary };
  }

  for (let repairIndex = 0; repairIndex < maxRepairAttempts; repairIndex += 1) {
    const repairResponse = await client.chatCode({
      messages: buildRepairMessages(input, rawCode, validation.diagnostics, contextPack),
      temperature: 0.02,
      numPredict: 1_200,
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
    validation = validateTracedElementEdit(rawCode, input);
    if (validation.ok) {
      return { ok: true, code: rawCode, attempts, repaired: true, validation, context: contextPack.summary };
    }
  }

  return {
    ok: false,
    reason: 'GLM element edit failed validation after repair.',
    attempts,
    diagnostics: validation.diagnostics,
    context: contextPack.summary,
    rawCode,
  };
}

export function validateTracedElementEdit(
  code: string,
  input: Pick<FreeformElementEditInput, 'marker' | 'expectedTagName' | 'allowTagChange' | 'filename'>,
): FreeformElementEditValidation {
  const diagnostics: FreeformGlmDiagnostic[] = [
    ...findDangerousFreeformTsx(code),
  ];
  const root = readRootElement(code, input.filename ?? 'Replacement.tsx', diagnostics);

  if (!root) {
    return { ok: false, diagnostics };
  }

  const expectedTagName = input.expectedTagName;
  if (expectedTagName && !input.allowTagChange && root.tagName !== expectedTagName) {
    diagnostics.push({
      code: 'root_tag_changed',
      severity: 'error',
      message: `Replacement root tag must remain ${expectedTagName}; got ${root.tagName}.`,
    });
  }

  if (root.dataEid !== input.marker.eid) {
    diagnostics.push({
      code: 'missing_or_changed_eid',
      severity: 'error',
      message: `Replacement root must preserve data-eid="${input.marker.eid}".`,
    });
  }

  if (root.sourceLoc !== input.marker.sourceLoc) {
    diagnostics.push({
      code: 'missing_or_changed_source_loc',
      severity: 'error',
      message: `Replacement root must preserve data-source-loc="${input.marker.sourceLoc}".`,
    });
  }

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
    rootTagName: root.tagName,
  };
}

function buildEditMessages(
  input: FreeformElementEditInput,
  contextPack: FreeformContextPack,
) {
  return [
    {
      role: 'system' as const,
      content: [
        'You edit one traced JSX element for an Editron Remotion scene.',
        'Use the context pack as grounding, but never mention it in output.',
        'Return ONLY the replacement JSX element. No markdown, no prose.',
        'Preserve the root data-eid and data-source-loc values exactly.',
        input.allowTagChange ? 'Changing the root tag is allowed.' : 'Do not change the root tag.',
        'Do not use network calls, browser globals, storage, eval, dynamic imports, or external assets.',
        formatFreeformContextPack(contextPack),
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: [
        `Instruction: ${input.instruction}`,
        `Expected root tag: ${input.expectedTagName ?? 'unchanged'}`,
        `Required data-eid: ${input.marker.eid}`,
        `Required data-source-loc: ${input.marker.sourceLoc}`,
        'Current element:',
        input.elementCode,
      ].join('\n'),
    },
  ];
}

function buildRepairMessages(
  input: FreeformElementEditInput,
  code: string,
  diagnostics: readonly FreeformGlmDiagnostic[],
  contextPack: FreeformContextPack,
) {
  return [
    {
      role: 'system' as const,
      content: [
        'Repair the replacement JSX element.',
        'Return ONLY one valid JSX element. No markdown, no prose.',
        'Preserve root data-eid and data-source-loc exactly.',
        'Preserve the creative intent from the context pack while fixing the deterministic contract.',
        formatFreeformContextPack(contextPack),
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: [
        `Instruction: ${input.instruction}`,
        'Validation diagnostics:',
        formatDiagnostics(diagnostics),
        'Replacement code:',
        code,
      ].join('\n'),
    },
  ];
}

function requestFailure(
  reason: string,
  attempts: number,
  context: FreeformContextPackSummary,
): FreeformElementEditResult {
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

interface RootElementFacts {
  tagName: string;
  dataEid?: string;
  sourceLoc?: string;
}

function readRootElement(
  code: string,
  filename: string,
  diagnostics: FreeformGlmDiagnostic[],
): RootElementFacts | null {
  const prefix = 'const __editronReplacement = (';
  const suffix = ');';
  const wrapped = `${prefix}${code.trim()}${suffix}`;

  try {
    const sourceFile = parseFreeformTsx(wrapped, filename);
    const statement = sourceFile.statements[0];
    if (!statement || !ts.isVariableStatement(statement)) {
      diagnostics.push(invalidReplacement('Replacement did not parse as a variable statement.'));
      return null;
    }

    const declaration = statement.declarationList.declarations[0];
    if (!declaration?.initializer) {
      diagnostics.push(invalidReplacement('Replacement did not include a JSX initializer.'));
      return null;
    }

    const expression = ts.isParenthesizedExpression(declaration.initializer)
      ? declaration.initializer.expression
      : declaration.initializer;
    const opening = rootOpening(expression);

    if (!opening) {
      diagnostics.push(invalidReplacement('Replacement must be one JSX element, not a fragment or expression.'));
      return null;
    }

    return {
      tagName: opening.tagName.getText(sourceFile),
      dataEid: readStringAttribute(opening, sourceFile, 'data-eid'),
      sourceLoc: readStringAttribute(opening, sourceFile, 'data-source-loc'),
    };
  } catch (error) {
    diagnostics.push({
      code: 'invalid_replacement_tsx',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function rootOpening(expression: ts.Expression): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null {
  if (ts.isJsxElement(expression)) return expression.openingElement;
  if (ts.isJsxSelfClosingElement(expression)) return expression;
  return null;
}

function readStringAttribute(
  opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile,
  name: string,
): string | undefined {
  const attribute = opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );

  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return undefined;
  return ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined;
}

function invalidReplacement(message: string): FreeformGlmDiagnostic {
  return {
    code: 'invalid_replacement',
    severity: 'error',
    message,
  };
}
