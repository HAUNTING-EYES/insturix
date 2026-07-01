import * as ts from 'typescript';

import {
  FreeformEditableProperty,
  FreeformTraceElement,
  FreeformTraceOptions,
  InstrumentedFreeformTsx,
  ParsedSourceLoc,
} from './types';

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

type JsxOpeningLike = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
type JsxTraceNode = ts.JsxElement | ts.JsxSelfClosingElement;

interface InternalTraceElement extends FreeformTraceElement {
  opening: JsxOpeningLike;
}

type SourceFileWithParseDiagnostics = ts.SourceFile & {
  parseDiagnostics?: readonly ts.Diagnostic[];
};

export function instrumentFreeformTsx(
  sourceCode: string,
  options: FreeformTraceOptions = {},
): InstrumentedFreeformTsx {
  const fileName = toDisplayFileName(options.filename ?? 'Scene.tsx');
  const sourceFile = parseFreeformTsx(sourceCode, fileName);
  const elements = collectTraceElements(sourceCode, sourceFile, options);
  const edits: TextEdit[] = [];
  let insertedAttributeCount = 0;

  for (const element of elements) {
    const missingAttributes: string[] = [];
    if (!hasJsxAttribute(element.opening, sourceFile, 'data-source-loc')) {
      missingAttributes.push(`data-source-loc="${escapeJsxAttribute(element.sourceLoc)}"`);
    }
    if (!hasJsxAttribute(element.opening, sourceFile, 'data-eid')) {
      missingAttributes.push(`data-eid="${escapeJsxAttribute(element.eid)}"`);
    }
    if (missingAttributes.length === 0) continue;

    edits.push({
      start: element.opening.attributes.pos,
      end: element.opening.attributes.pos,
      text: ` ${missingAttributes.join(' ')}`,
    });
    insertedAttributeCount += missingAttributes.length;
  }

  return {
    code: applyTextEdits(sourceCode, edits),
    fileName,
    elements: elements.map(stripInternalTraceFields),
    insertedAttributeCount,
  };
}

export function buildFreeformElementMap(
  sourceCode: string,
  options: FreeformTraceOptions = {},
): FreeformTraceElement[] {
  const fileName = toDisplayFileName(options.filename ?? 'Scene.tsx');
  const sourceFile = parseFreeformTsx(sourceCode, fileName);
  return collectTraceElements(sourceCode, sourceFile, options).map(stripInternalTraceFields);
}

export function parseSourceLoc(sourceLoc: string): ParsedSourceLoc | null {
  const parts = sourceLoc.split(':');
  if (parts.length < 3) return null;

  const line = Number(parts.at(-2));
  const column = Number(parts.at(-1));
  if (!Number.isInteger(line) || !Number.isInteger(column)) return null;

  return {
    fileName: parts.slice(0, -2).join(':'),
    line,
    column,
  };
}

export function sameSourceLoc(left: string, right: string): boolean {
  const leftLoc = parseSourceLoc(left);
  const rightLoc = parseSourceLoc(right);
  if (!leftLoc || !rightLoc) return left === right;
  return leftLoc.line === rightLoc.line && leftLoc.column === rightLoc.column;
}

export function applyTextEdits(sourceCode: string, edits: TextEdit[]): string {
  if (edits.length === 0) return sourceCode;

  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((nextSource, edit) => {
      if (edit.start < 0 || edit.end < edit.start || edit.end > nextSource.length) {
        throw new Error(`Invalid freeform trace edit range: ${edit.start}-${edit.end}`);
      }
      return nextSource.slice(0, edit.start) + edit.text + nextSource.slice(edit.end);
    }, sourceCode);
}

export function parseFreeformTsx(sourceCode: string, fileName = 'Scene.tsx'): ts.SourceFile {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const parseDiagnostics = (sourceFile as SourceFileWithParseDiagnostics).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    const first = parseDiagnostics[0];
    const message = ts.flattenDiagnosticMessageText(first.messageText, '\n');
    const loc = typeof first.start === 'number'
      ? sourceFile.getLineAndCharacterOfPosition(first.start)
      : null;
    const suffix = loc ? ` at ${loc.line + 1}:${loc.character}` : '';
    throw new Error(`Invalid TSX source${suffix}: ${message}`);
  }

  return sourceFile;
}

function collectTraceElements(
  sourceCode: string,
  sourceFile: ts.SourceFile,
  options: FreeformTraceOptions,
): InternalTraceElement[] {
  const fileName = toDisplayFileName(options.filename ?? sourceFile.fileName);
  const eidPrefix = sanitizeEidPart(options.eidPrefix ?? removeExtension(fileName));
  const elements: InternalTraceElement[] = [];
  const byEid = new Map<string, InternalTraceElement>();

  const appendElement = (
    node: JsxTraceNode,
    opening: JsxOpeningLike,
    parentEid: string | null,
  ): InternalTraceElement => {
    const position = sourceFile.getLineAndCharacterOfPosition(opening.getStart(sourceFile));
    const line = position.line + 1;
    const column = position.character;
    const sourceLoc = readStringAttribute(opening, sourceFile, 'data-source-loc')
      ?? `${fileName}:${line}:${column}`;
    const generatedEid = `${eidPrefix}_${String(elements.length + 1).padStart(3, '0')}_${line}_${column}`;
    const eid = readStringAttribute(opening, sourceFile, 'data-eid') ?? generatedEid;
    const tagName = opening.tagName.getText(sourceFile);
    const element: InternalTraceElement = {
      eid,
      sourceLoc,
      tagName,
      parentEid,
      childEids: [],
      editable: inferEditableProperties(node, opening, sourceFile),
      selfClosing: ts.isJsxSelfClosingElement(node),
      start: node.getStart(sourceFile),
      end: node.end,
      openingStart: opening.getStart(sourceFile),
      openingEnd: opening.end,
      existingTrace:
        hasJsxAttribute(opening, sourceFile, 'data-eid') &&
        hasJsxAttribute(opening, sourceFile, 'data-source-loc'),
      opening,
      textPreview: textPreviewForNode(node, sourceCode, sourceFile),
    };

    elements.push(element);
    byEid.set(element.eid, element);
    if (parentEid) {
      byEid.get(parentEid)?.childEids.push(element.eid);
    }
    return element;
  };

  const visit = (node: ts.Node, parentEid: string | null) => {
    if (ts.isJsxElement(node)) {
      const element = appendElement(node, node.openingElement, parentEid);
      for (const child of node.children) visit(child, element.eid);
      return;
    }

    if (ts.isJsxSelfClosingElement(node)) {
      appendElement(node, node, parentEid);
      return;
    }

    ts.forEachChild(node, (child) => visit(child, parentEid));
  };

  visit(sourceFile, null);
  return elements;
}

function inferEditableProperties(
  node: JsxTraceNode,
  opening: JsxOpeningLike,
  sourceFile: ts.SourceFile,
): FreeformEditableProperty[] {
  const editable = new Set<FreeformEditableProperty>(['props']);
  const tagName = opening.tagName.getText(sourceFile);
  const lowerTag = tagName.toLowerCase();

  if (isIntrinsicTag(tagName)) editable.add('style');
  if (hasJsxAttribute(opening, sourceFile, 'style')) editable.add('style');
  if (hasJsxAttribute(opening, sourceFile, 'className')) editable.add('className');
  if (!ts.isJsxSelfClosingElement(node)) editable.add('children');
  if (
    ['h1', 'h2', 'h3', 'h4', 'p', 'span', 'strong', 'em', 'button', 'label', 'div'].includes(lowerTag) &&
    (!ts.isJsxSelfClosingElement(node) || hasMeaningfulText(node, sourceFile))
  ) {
    editable.add('text');
  }

  return [...editable];
}

function textPreviewForNode(
  node: JsxTraceNode,
  _sourceCode: string,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (ts.isJsxSelfClosingElement(node)) return undefined;

  const text = node.children
    .filter(ts.isJsxText)
    .map((child) => child.getText(sourceFile).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 120);

  return text.length > 0 ? text : undefined;
}

function hasMeaningfulText(node: JsxTraceNode, sourceFile: ts.SourceFile): boolean {
  if (ts.isJsxSelfClosingElement(node)) return false;
  return node.children.some(
    (child) => ts.isJsxText(child) && child.getText(sourceFile).trim().length > 0,
  );
}

function hasJsxAttribute(
  opening: JsxOpeningLike,
  sourceFile: ts.SourceFile,
  name: string,
): boolean {
  return opening.attributes.properties.some(
    (property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );
}

function readStringAttribute(
  opening: JsxOpeningLike,
  sourceFile: ts.SourceFile,
  name: string,
): string | null {
  const property = opening.attributes.properties.find(
    (attr) => ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === name,
  );
  if (!property || !ts.isJsxAttribute(property) || !property.initializer) return null;
  if (ts.isStringLiteral(property.initializer)) return property.initializer.text;
  return null;
}

function isIntrinsicTag(tagName: string): boolean {
  return /^[a-z]/.test(tagName);
}

function toDisplayFileName(fileName: string): string {
  return fileName.replace(/\\/g, '/').split('/').pop() || fileName;
}

function removeExtension(fileName: string): string {
  return fileName.replace(/\.[cm]?[tj]sx?$/i, '');
}

function sanitizeEidPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'scene';
}

function escapeJsxAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function stripInternalTraceFields(element: InternalTraceElement): FreeformTraceElement {
  const { opening: _opening, ...publicElement } = element;
  return publicElement;
}

