import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { buildDevelopmentNoProviderPlanV2 } from '../lib/editron/research/open-ended-planner/staged-packet-v2';

const defaultOutput = '.calibration-temp/open-ended-planner-v2/development-no-provider-plan-v2.json';
const sourcePaths = [
  'tests/fixtures/editron/open-ended-planner-v2/benchmark-contract-v2.json',
  'tests/fixtures/editron/open-ended-planner-v2/tasks-v2.json',
  'tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json',
  'tests/fixtures/editron/open-ended-planner-v2/development-media-manifest-v2.json',
  'tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json',
  'tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json',
  'lib/editron/research/open-ended-planner/staged-packet-v2.ts',
];

function outputPath(args: string[]): string {
  const index = args.indexOf('--output');
  const value = index === -1 ? defaultOutput : args[index + 1];
  if (!value || value.startsWith('--') || !value.endsWith('.json')) throw new Error('--output must name a JSON file');
  const absolute = resolve(value);
  if (absolute === parse(absolute).root || absolute === resolve(process.cwd())) throw new Error(`Refusing broad output path: ${absolute}`);
  return absolute;
}

async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(resolve(path))).digest('hex');
}

async function main(): Promise<void> {
  const destination = outputPath(process.argv.slice(2));
  const sourceBindings = await Promise.all(sourcePaths.map(async (path) => ({ path, sha256: await sha256File(path) })));
  const plan = buildDevelopmentNoProviderPlanV2();
  const material = { ...plan, sourceBindings };
  const artifact = { ...material, planHash: hashCanonicalJsonV1(material) };
  const partial = `${destination}.partial`;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(partial, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  await rm(destination, { force: true });
  await rename(partial, destination);
  process.stdout.write(`${JSON.stringify({ destination, stageOnePackets: plan.stageOnePackets.length, branches: plan.branches.length, planHash: artifact.planHash })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
