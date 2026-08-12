import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { materializeDevelopmentMediaV2 } from '../lib/editron/research/open-ended-planner/media-materializer-v2';

const defaultOutput = '.calibration-temp/open-ended-planner-v2/development-media';

function outputDirectoryFromArgs(args: string[]): string {
  const index = args.indexOf('--output');
  if (index === -1) return resolve(defaultOutput);
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error('--output requires an explicit directory');
  return resolve(value);
}

async function main(): Promise<void> {
  const outputDirectory = outputDirectoryFromArgs(process.argv.slice(2));
  const manifest = await materializeDevelopmentMediaV2(outputDirectory);
  const manifestPath = resolve(outputDirectory, '..', 'development-media-manifest-v2.json');
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ manifestPath, artifacts: manifest.artifacts.length })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
