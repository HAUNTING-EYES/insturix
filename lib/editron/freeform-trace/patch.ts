import * as ts from 'typescript';

import { FreeformTraceTarget } from './types';
import {
  applyTextEdits,
  buildFreeformElementMap,
  parseFreeformTsx,
  sameSourceLoc,
} from './instrument';

interface PatchOptions {
  filename?: string;
}

interface TraceMarker {
  eid: string;
  sourceLoc: string;
}

interface RootTraceEdit {
  start: number;
  end: number;
  text: string;
}

type JsxOpeningLike = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

export function extractTracedElementCode(
  sourceCode: string,
  target: FreeformTraceTarget,
  options: PatchOptions = {},
): string {
  const element = findTargetElement(sourceCode, target, options);
  return sourceCode.slice(element.start, element.end);
}

export function patchTracedElementCode(
  sourceCode: string,
  target: FreeformTraceTarget,
  replacementCode: string,
  options: PatchOptions = {},
): string {
  const element = findTargetElement(sourceCode, target, options);
  const replacement = ensureRootTraceAttributes(replacementCode.trim(), {
    eid: element.eid,
    sourceLoc: element.sourceLoc,
  });

  return sourceCode.slice(0, element.start) + replacement + sourceCode.slice(element.end);
}

function findTargetElement(
  sourceCode: string,
  target: FreeformTraceTarget,
  options: PatchOptions,
) {
  if (!target.eid && !target.sourceLoc) {
    throw new Error('A freeform trace target needs eid or sourceLoc.');
  }

  const elements = buildFreeformElementMap(sourceCode, options);
  const byEid = target.eid ? elements.find((element) => element.eid === target.eid) : undefined;
  if (byEid) return byEid;

  const bySourceLoc = target.sourceLoc
    ? elements.find((element) => sameSourceLoc(element.sourceLoc, target.sourceLoc!))
    : undefined;
  if (bySourceLoc) return bySourceLoc;

  throw new Error(
    `No traced JSX element found for ${target.eid ? `eid=${target.eid}` : `sourceLoc=${target.sourceLoc}`}.`,
  );
}

function ensureRootTraceAttributes(replacementCode: string, marker: TraceMarker): string {
  const prefix = 'const __editronReplacement = (';
  const suffix = ');';
  const wrapped = `${prefix}${replacementCode}${suffix}`;
  const sourceFile = parseFreeformTsx(wrapped, 'Replacement.tsx');
  const initializer = findReplacementInitializer(sourceFile);
  const root = ts.isParenthesizedExpression(initializer) ? initializer.expression : initializer;
  const opening = rootOpeningElement(root);

  if (!opening) {
    throw new Error('Replacement must be a JSX element or JSX self-closing element.');
  }

  const edits: RootTraceEdit[] = [
    ...traceAttributeEdits(opening, sourceFile, 'data-source-loc', marker.sourceLoc),
    ...traceAttributeEdits(opening, sourceFile, 'data-eid', marker.eid),
  ];
  const nextWrapped = applyTextEdits(wrapped, edits);
  return nextWrapped.slice(prefix.length, nextWrapped.length - suffix.length);
}

function findReplacementInitializer(sourceFile: ts.SourceFile): ts.Expression {
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) {
    throw new Error('Replacement wrapper did not parse as a variable statement.');
  }

  const declaration = statement.declarationList.declarations[0];
  if (!declaration?.initializer) {
    throw new Error('Replacement wrapper did not include an initializer.');
  }

  return declaration.initializer;
}

function rootOpeningElement(expression: ts.Expression): JsxOpeningLike | null {
  if (ts.isJsxElement(expression)) return expression.openingElement;
  if (ts.isJsxSelfClosingElement(expression)) return expression;
  return null;
}

function traceAttributeEdits(
  opening: JsxOpeningLike,
  sourceFile: ts.SourceFile,
  name: 'data-source-loc' | 'data-eid',
  value: string,
): RootTraceEdit[] {
  const attribute = opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );

  if (!attribute || !ts.isJsxAttribute(attribute)) {
    return [{
      start: opening.attributes.pos,
      end: opening.attributes.pos,
      text: ` ${name}=${JSON.stringify(value)}`,
    }];
  }

  if (!attribute.initializer) {
    return [{
      start: attribute.name.end,
      end: attribute.name.end,
      text: `=${JSON.stringify(value)}`,
    }];
  }

  return [{
    start: attribute.initializer.getStart(sourceFile),
    end: attribute.initializer.end,
    text: JSON.stringify(value),
  }];
}

