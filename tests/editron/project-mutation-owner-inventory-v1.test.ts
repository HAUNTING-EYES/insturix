import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx']);
const WRITE_METHOD = '(?:updateOne|updateMany|findOneAndUpdate|replaceOne|bulkWrite|deleteOne|deleteMany)';
const DIRECT_PROJECT_COLLECTION = new RegExp(
  `collection\\s*\\(\\s*(?:COLLECTIONS\\.PROJECTS|collections\\.projects|["']projects["'])\\s*\\)\\s*\\.\\s*(${WRITE_METHOD})\\s*\\(`,
  'g',
);
const PROJECT_COLLECTION_DECLARATION = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]{0,240}collection\s*\(\s*(?:COLLECTIONS\.PROJECTS|collections\.projects|["']projects["'])\s*\)/g;
const PROJECT_MODEL_WRITE = new RegExp(
  `\\b(?:ProjectModel|projectModel|Project)\\s*\\.\\s*(${WRITE_METHOD})\\s*\\(`,
  'g',
);

const ALLOWED_PROJECT_WRITERS = new Set([
  'lib/editron/services/assist-lane.ts',
  'lib/editron/services/assist-refund-recovery.ts',
  'lib/editron/services/chat-edit-battle-fixture-cleanup.ts',
  'lib/editron/services/project-service.ts',
]);

interface WriteHit {
  file: string;
  method: string;
  spelling: 'ALIAS' | 'DIRECT_COLLECTION' | 'MONGOOSE_MODEL';
}

function extension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot);
}

function sourceFiles(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      result.push(...sourceFiles(absolute));
    } else if (SOURCE_EXTENSIONS.has(extension(entry))) {
      result.push(absolute);
    }
  }
  return result;
}

function normalized(path: string): string {
  return relative(process.cwd(), path).split(sep).join('/');
}

function belongsToEditronRuntime(path: string): boolean {
  return path.startsWith('app/api/internal/')
    || path.startsWith('app/api/services/alyzitron/')
    || path.startsWith('app/api/services/editron/')
    || path.startsWith('app/api/services/pipeline/')
    || path.startsWith('app/api/cron/')
    || path.startsWith('lib/alyzitron/')
    || path.startsWith('lib/clickatron/')
    || path.startsWith('lib/editron/')
    || path.startsWith('lib/pipeline/')
    || path.startsWith('lib/shared/')
    || path.startsWith('lib/uploaderx/');
}

function collectMatches(
  source: string,
  file: string,
  expression: RegExp,
  spelling: WriteHit['spelling'],
): WriteHit[] {
  expression.lastIndex = 0;
  return [...source.matchAll(expression)].map((match) => ({
    file,
    method: match[1] ?? 'UNKNOWN',
    spelling,
  }));
}

function collectProjectWrites(path: string): WriteHit[] {
  const file = normalized(path);
  if (!belongsToEditronRuntime(file)) return [];
  const source = readFileSync(path, 'utf8');
  const hits = [
    ...collectMatches(source, file, DIRECT_PROJECT_COLLECTION, 'DIRECT_COLLECTION'),
    ...collectMatches(source, file, PROJECT_MODEL_WRITE, 'MONGOOSE_MODEL'),
  ];

  PROJECT_COLLECTION_DECLARATION.lastIndex = 0;
  for (const declaration of source.matchAll(PROJECT_COLLECTION_DECLARATION)) {
    const alias = declaration[1];
    if (!alias) continue;
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const aliasWrite = new RegExp(
      `\\b${escapedAlias}\\s*\\.\\s*(${WRITE_METHOD})\\s*\\(`,
      'g',
    );
    hits.push(...collectMatches(source, file, aliasWrite, 'ALIAS'));
  }
  return hits;
}

describe('Editron project mutation owner inventory V1', () => {
  it('keeps every detected runtime project write behind a classified owner', () => {
    const files = [
      ...sourceFiles(join(process.cwd(), 'app')),
      ...sourceFiles(join(process.cwd(), 'lib')),
    ];
    const writes = files.flatMap(collectProjectWrites);
    const unexpected = writes.filter((hit) => !ALLOWED_PROJECT_WRITERS.has(hit.file));

    expect(unexpected).toEqual([]);
    for (const owner of ALLOWED_PROJECT_WRITERS) {
      expect(writes.some((hit) => hit.file === owner), owner).toBe(true);
    }
  });

  it('keeps removed unfenced metadata helpers out of runtime source', () => {
    const files = [
      ...sourceFiles(join(process.cwd(), 'app')),
      ...sourceFiles(join(process.cwd(), 'lib')),
    ].filter((path) => belongsToEditronRuntime(normalized(path)));
    const forbidden = ['deriveProjectStatus(', 'refreshProjectStatus(', 'updateProjectMetadata('];
    const hits = files.flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return forbidden
        .filter((token) => source.includes(token))
        .map((token) => ({ file: normalized(path), token }));
    });

    expect(hits).toEqual([]);
  });

  it('keeps legacy-unknown actor provenance out of current mutation commands', () => {
    const projectServiceSource = readFileSync(
      join(process.cwd(), 'lib/editron/services/project-service.ts'),
      'utf8',
    );
    const checkpointServiceSource = readFileSync(
      join(process.cwd(), 'lib/editron/services/checkpoint-service.ts'),
      'utf8',
    );

    expect(projectServiceSource).toContain(
      'export type ProjectTimelineMutationActorKindV1 = Exclude<',
    );
    expect(projectServiceSource).toContain(
      'actorKind: ProjectTimelineMutationActorKindV1;',
    );
    expect(projectServiceSource.match(
      /actorKind: ProjectTimelineChangeActorKindV1;/g,
    )).toHaveLength(1);
    expect(projectServiceSource).not.toContain(
      'actorKind?: ProjectTimelineChangeActorKindV1',
    );
    expect(projectServiceSource).not.toContain(
      '?? "UNKNOWN_LEGACY_CALLER"',
    );
    expect(projectServiceSource).not.toContain(
      'assertProjectTimelineChangeActorKindV1',
    );
    expect(checkpointServiceSource).toContain(
      'type ProjectTimelineMutationActorKindV1,',
    );
    expect(checkpointServiceSource).not.toContain(
      'type ProjectTimelineChangeActorKindV1,',
    );
  });
});
