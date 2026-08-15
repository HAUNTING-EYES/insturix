import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';

import { buildDevelopmentMechanicsPreflightV2 } from '../lib/editron/research/open-ended-planner/development-mechanics-preflight-v2';

const defaultOutput = 'tests/fixtures/editron/open-ended-planner-v2/development-mechanics-preflight-v2.json';
const apiSource = 'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx';

function outputPath(args: string[]): string {
  const index = args.indexOf('--output');
  const value = index === -1 ? defaultOutput : args[index + 1];
  if (!value || value.startsWith('--') || !value.endsWith('.json')) throw new Error('--output must name a JSON file');
  const absolute = resolve(value);
  if (absolute === parse(absolute).root || absolute === resolve(process.cwd())) throw new Error(`Refusing broad output path: ${absolute}`);
  return absolute;
}

async function main(): Promise<void> {
  const destination = outputPath(process.argv.slice(2));
  const implementationHash = createHash('sha256').update(await readFile(resolve(apiSource))).digest('hex');
  const artifact = await buildDevelopmentMechanicsPreflightV2({
    generatedCompositionApiImplementationHash: implementationHash,
  });
  const partial = `${destination}.partial`;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(partial, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  await rm(destination, { force: true });
  await rename(partial, destination);
  process.stdout.write(`${JSON.stringify({ destination, planHash: artifact.planHash })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
