import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

import { runDevelopmentSmokeV2 } from '../lib/editron/research/open-ended-planner/provider-smoke-runner-v2';

loadEnv({ path: resolve('.env.local'), override: false, quiet: true });

interface ArgumentsV2 {
  planHash: string;
  maxSpendUsd: number;
  operatorId: string;
  output: string;
}

function argumentsV2(values: string[]): ArgumentsV2 {
  const value = (name: string): string => {
    const index = values.indexOf(name);
    const result = index === -1 ? '' : values[index + 1] ?? '';
    if (!result || result.startsWith('--')) throw new Error(`${name} is required`);
    return result;
  };
  const maxSpendUsd = Number(value('--max-spend-usd'));
  if (!Number.isFinite(maxSpendUsd) || maxSpendUsd <= 0) throw new Error('--max-spend-usd must be positive');
  const output = resolve(value('--output'));
  if (!output.endsWith('.json') || output === parse(output).root || output === resolve(process.cwd())) {
    throw new Error('--output must name a bounded JSON file');
  }
  return {
    planHash: value('--plan-hash'),
    maxSpendUsd,
    operatorId: value('--operator-id'),
    output,
  };
}

async function main(): Promise<void> {
  const args = argumentsV2(process.argv.slice(2));
  const receipt = await runDevelopmentSmokeV2({
    expectedPlanHash: args.planHash,
    maxAuthorizedSpendUsd: args.maxSpendUsd,
    operatorId: args.operatorId,
    confirmedAt: new Date().toISOString(),
    environment: process.env,
  });
  const partial = `${args.output}.partial`;
  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(partial, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await rm(args.output, { force: true });
  await rename(partial, args.output);
  process.stdout.write(`${JSON.stringify({
    output: args.output,
    planHash: receipt.planHash,
    receiptHash: receipt.receiptHash,
    actualProviderCostUsd: receipt.actualProviderCostUsd,
    rows: receipt.rows.map(({ rowId, run }) => ({ rowId, disposition: run.disposition, attempts: run.attempts.length })),
  })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
