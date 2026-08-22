import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V6,
  hashNormalizedCap2SourceSnapshotV6,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v6';
import { parseCap2SourceSurfaceInventoryV1 } from '@/lib/editron/research/capability-census/cap2-source-surface-contract-v1';

const REPOSITORY_ROOT = process.cwd();

interface ExtractedSurface {
  ids: string[];
  paths: string[];
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareCodeUnits);
}

function absolutePath(relativePath: string): string {
  return path.resolve(REPOSITORY_ROOT, relativePath);
}

function readSourceText(relativePath: string): string {
  return readFileSync(absolutePath(relativePath), 'utf8');
}

function parseSource(relativePath: string): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    readSourceText(relativePath),
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function walkSourceFiles(root: string): string[] {
  const visit = (relativeDirectory: string): string[] => readdirSync(absolutePath(relativeDirectory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relativeEntry = path.posix.join(relativeDirectory.replaceAll('\\', '/'), entry.name);
    return entry.isDirectory() ? visit(relativeEntry) : [relativeEntry];
  });
  return visit(root);
}

function propertyName(node: ts.PropertyName): string {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return node.getText();
}

function extractEditorContextFunctions(): ExtractedSurface {
  const relativePath = 'components/editron/editor/version-7.0.0/contexts/editor-context.tsx';
  const source = parseSource(relativePath);
  let ids: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'EditorContextProps') {
      ids = node.members
        .filter((member): member is ts.PropertySignature => ts.isPropertySignature(member)
          && Boolean(member.type) && ts.isFunctionTypeNode(member.type!))
        .map((member) => propertyName(member.name));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { ids: sortedUnique(ids), paths: [relativePath] };
}

function extractTimelineShortcuts(): ExtractedSurface {
  const relativePath = 'components/editron/editor/version-7.0.0/hooks/use-timeline-shortcuts.ts';
  const source = parseSource(relativePath);
  const ids: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'useHotkeys' && node.arguments[0]
      && ts.isStringLiteral(node.arguments[0])) ids.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { ids: sortedUnique(ids), paths: [relativePath] };
}

function extractOverlayTypes(): ExtractedSurface {
  const relativePath = 'components/editron/editor/version-7.0.0/types.ts';
  const source = parseSource(relativePath);
  let ids: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isEnumDeclaration(node) && node.name.text === 'OverlayType') {
      ids = node.members.map((member) => member.initializer && ts.isStringLiteral(member.initializer)
        ? member.initializer.text
        : propertyName(member.name));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { ids: sortedUnique(ids), paths: [relativePath] };
}

function extractLayerContentCases(): ExtractedSurface {
  const relativePath = 'components/editron/editor/version-7.0.0/components/core/layer-content.tsx';
  const source = parseSource(relativePath);
  const ids: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCaseClause(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source) === 'OverlayType') ids.push(node.expression.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { ids: sortedUnique(ids), paths: [relativePath] };
}

function extractChatRegistry(): ExtractedSurface {
  const relativePath = 'lib/editron/agent/chat-tool-registry.ts';
  const source = parseSource(relativePath);
  let ids: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'CHAT_TOOL_REGISTRY') {
      let initializer = node.initializer;
      if (initializer && ts.isSatisfiesExpression(initializer)) initializer = initializer.expression;
      if (initializer && ts.isObjectLiteralExpression(initializer)) {
        ids = initializer.properties.flatMap((property) => property.name
          ? [propertyName(property.name)]
          : []);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { ids: sortedUnique(ids), paths: [relativePath] };
}

function declarationMap(source: ts.SourceFile): Map<string, ts.Expression> {
  const declarations = new Map<string, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return declarations;
}

function declaredToolName(node: ts.Node | undefined): string | undefined {
  let result: string | undefined;
  const visit = (candidate: ts.Node): void => {
    if (result) return;
    if (ts.isPropertyAssignment(candidate) && propertyName(candidate.name) === 'name'
      && (ts.isStringLiteral(candidate.initializer)
        || ts.isNoSubstitutionTemplateLiteral(candidate.initializer))) result = candidate.initializer.text;
    ts.forEachChild(candidate, visit);
  };
  if (node) visit(node);
  return result;
}

function extractReturnedToolNames(relativePath: string, functionName: string): string[] {
  const source = parseSource(relativePath);
  const declarations = declarationMap(source);
  let body: ts.Block | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) body = node.body;
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === functionName
      && node.initializer && ts.isArrowFunction(node.initializer)
      && ts.isBlock(node.initializer.body)) body = node.initializer.body;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!body) throw new Error(`Missing tool factory ${relativePath}#${functionName}`);
  const returnStatement = body.statements.filter(ts.isReturnStatement).at(-1);
  let expression = returnStatement?.expression;
  if (expression && ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    expression = expression.expression.expression;
  }
  if (!expression || !ts.isArrayLiteralExpression(expression)) {
    throw new Error(`Tool factory ${relativePath}#${functionName} does not return an array`);
  }
  return expression.elements.flatMap((element) => {
    if (!ts.isIdentifier(element)) return [];
    const name = declaredToolName(declarations.get(element.text));
    if (!name) throw new Error(`Unresolved returned tool ${relativePath}#${element.text}`);
    return [name];
  });
}

function extractChatBundle(): ExtractedSurface {
  const paths = sortedUnique([
    'lib/editron/agent/tools.ts',
    'lib/editron/agent/chat-transcript-tools.ts',
    'lib/editron/agent/chat-visual-tools.ts',
    'lib/editron/agent/chat-audio-tools.ts',
    'lib/editron/agent/chat-asset-tools.ts',
  ]);
  const ids = extractReturnedToolNames('lib/editron/agent/tools.ts', 'createTools').concat(
    extractReturnedToolNames('lib/editron/agent/chat-transcript-tools.ts', 'createChatTranscriptTools'),
    extractReturnedToolNames('lib/editron/agent/chat-visual-tools.ts', 'createChatVisualTools'),
    extractReturnedToolNames('lib/editron/agent/chat-audio-tools.ts', 'createChatAudioTools'),
    extractReturnedToolNames('lib/editron/agent/chat-asset-tools.ts', 'createChatAssetTools'),
  );
  return { ids: sortedUnique(ids), paths };
}

function exportedHttpMethods(relativePath: string): string[] {
  const source = parseSource(relativePath);
  const methods: string[] = [];
  for (const statement of source.statements) {
    const isExported = ts.canHaveModifiers(statement)
      && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(statement) && isExported && statement.name) methods.push(statement.name.text);
    if (ts.isVariableStatement(statement) && isExported) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) methods.push(declaration.name.text);
      }
    }
  }
  return methods.filter((method) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(method));
}

function extractApiRoutes(): ExtractedSurface {
  const candidates = walkSourceFiles('app/api')
    .filter((relativePath) => relativePath.endsWith('/route.ts'))
    .filter((relativePath) => relativePath.startsWith('app/api/services/editron/')
      || readSourceText(relativePath).includes('@/lib/editron'));
  const paths: string[] = [];
  const ids: string[] = [];
  for (const relativePath of candidates) {
    const methods = exportedHttpMethods(relativePath);
    if (methods.length === 0) continue;
    paths.push(relativePath);
    const route = `/${relativePath.replace(/^app\//, '').replace(/\/route\.ts$/, '')}`;
    ids.push(...methods.map((method) => `${method} ${route}`));
  }
  return { ids: sortedUnique(ids), paths: sortedUnique(paths) };
}

function extractDirectorCallers(): ExtractedSurface {
  const paths = walkSourceFiles('app/api').concat(walkSourceFiles('lib/editron'))
    .filter((relativePath) => relativePath.endsWith('.ts') || relativePath.endsWith('.tsx'))
    .filter((relativePath) => !relativePath.includes('/research/'))
    .filter((relativePath) => readSourceText(relativePath).includes('executeDirectorPlan'));
  return { ids: sortedUnique(paths), paths: sortedUnique(paths) };
}

function extractProjectServiceMethods(): ExtractedSurface {
  const relativePath = 'lib/editron/services/project-service.ts';
  const source = parseSource(relativePath);
  let ids: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === 'ProjectService') {
      ids = node.members.filter(ts.isMethodDeclaration)
        .filter((member) => !member.modifiers?.some((modifier) =>
          modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword))
        .map((member) => propertyName(member.name));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { ids: sortedUnique(ids), paths: [relativePath] };
}

function extractPathCandidates(pattern: RegExp): ExtractedSurface {
  const paths = walkSourceFiles('lib/editron')
    .filter((relativePath) => relativePath.endsWith('.ts') || relativePath.endsWith('.tsx'))
    .filter((relativePath) => !relativePath.includes('/research/'))
    .filter((relativePath) => pattern.test(path.basename(relativePath)));
  return { ids: sortedUnique(paths), paths: sortedUnique(paths) };
}

function currentExtractions(): Record<string, ExtractedSurface> {
  return {
    'api.editron-linked-route-exports': extractApiRoutes(),
    'chat.compatibility-tool-bundle': extractChatBundle(),
    'chat.registry-descriptors': extractChatRegistry(),
    'director.execute-plan-callers': extractDirectorCallers(),
    'manual.editor-context-functions': extractEditorContextFunctions(),
    'manual.timeline-shortcuts': extractTimelineShortcuts(),
    'persistence.project-service-public-methods': extractProjectServiceMethods(),
    'proof.render-delivery-module-candidates': extractPathCandidates(/(proof|evidence|render|delivery|finaliz)/i),
    'render.layer-content-overlay-cases': extractLayerContentCases(),
    'state.overlay-type-declarations': extractOverlayTypes(),
    'worker.job-module-candidates': extractPathCandidates(/(^|[-_.])(job|worker|runner|dispatch)([-_.]|$)/i),
  };
}

describe('CAP-2 source-surface inventory v1', () => {
  it('accepts the closed inventory while retaining zero authority claims', () => {
    const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
    expect(inventory.observations).toHaveLength(11);
    expect(inventory.observations.every(({ authorityClaim }) => authorityClaim === 'NO_AUTHORITY_CLAIM')).toBe(true);
    expect(inventory.unresolvedSourceIds).toEqual(inventory.observations.map(({ sourceId }) => sourceId));
  });

  it('matches every reissued current observation to a fresh source extraction', () => {
    const extracted = currentExtractions();
    expect(Object.keys(extracted).sort(compareCodeUnits)).toEqual(
      CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6.map(({ sourceId }) => sourceId),
    );
    for (const observation of CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6) {
      expect(extracted[observation.sourceId], observation.sourceId).toEqual({
        ids: observation.observedIds,
        paths: observation.evidencePaths,
      });
    }
  });

  it('binds current source content without treating CRLF checkout changes as architecture drift', () => {
    expect(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V6).toHaveLength(222);
    expect(hashNormalizedCap2SourceSnapshotV6(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V6))
      .toBe(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.sourceBinding.normalizedSourceSnapshotHash);
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.status)
      .toBe('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY');
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.sourceBinding.reconciliationStatus)
      .toBe('RECONCILED_CURRENT_TRUTH_V6');
  });

  it('keeps chat descriptors distinct from the executable compatibility bundle', () => {
    const extracted = currentExtractions();
    const registry = new Set(extracted['chat.registry-descriptors'].ids);
    const bundle = new Set(extracted['chat.compatibility-tool-bundle'].ids);
    expect([...bundle].every((toolId) => registry.has(toolId))).toBe(true);
    expect([...registry].filter((toolId) => !bundle.has(toolId)).sort(compareCodeUnits)).toEqual([
      'apply_editorial_intent',
      'apply_reference_style',
      'dub_selected_dialogue',
      'get_clip_analysis_result',
      'get_dubbing_job_result',
      'queue_resolved_clip_analysis',
      'resolve_clip_analysis',
    ]);
  });

  it('keeps overlay state declarations distinct from main renderer support', () => {
    const extracted = currentExtractions();
    expect(extracted['state.overlay-type-declarations'].ids).toHaveLength(22);
    expect(extracted['render.layer-content-overlay-cases'].ids).toHaveLength(13);
  });

  it('rejects count, order, path-union and owner-reconciliation drift', () => {
    const countDrift = structuredClone(inventoryJson);
    countDrift.observations[0].observedCount += 1;
    expect(() => parseCap2SourceSurfaceInventoryV1(countDrift)).toThrow();

    const orderDrift = structuredClone(inventoryJson);
    orderDrift.observations[0].observedIds.reverse();
    expect(() => parseCap2SourceSurfaceInventoryV1(orderDrift)).toThrow();

    const pathDrift = structuredClone(inventoryJson);
    pathDrift.sourceBinding.sourceSnapshotPaths.pop();
    expect(() => parseCap2SourceSurfaceInventoryV1(pathDrift)).toThrow();

    const reconciliationDrift = structuredClone(inventoryJson);
    reconciliationDrift.unresolvedSourceIds.pop();
    expect(() => parseCap2SourceSurfaceInventoryV1(reconciliationDrift)).toThrow();
  });

  it('rejects any attempt to promote a source observation into an authority claim', () => {
    const invalid = structuredClone(inventoryJson);
    invalid.observations[0].authorityClaim = 'PRODUCTION_AUTHORITY';
    expect(() => parseCap2SourceSurfaceInventoryV1(invalid)).toThrow();
  });
});
