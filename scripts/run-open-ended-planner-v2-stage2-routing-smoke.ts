import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

import {
  buildStage2RoutingSmokePreflightV2,
  runStage2RoutingSmokeV2,
} from '../lib/editron/research/open-ended-planner/stage2-routing-smoke-v2';

loadEnv({ path: resolve('.env.local'), override: false, quiet: true });

function value(args: string[], name: string): string {
  const index = args.indexOf(name);
  const result = index === -1 ? '' : args[index + 1] ?? '';
  if (!result || result.startsWith('--')) throw new Error(`${name} is required`);
  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const plan = await buildStage2RoutingSmokePreflightV2() as Record<string, unknown>;
  if (args.includes('--print-plan')) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  const maxAuthorizedSpendUsd = Number(value(args, '--max-spend-usd'));
  if (!Number.isFinite(maxAuthorizedSpendUsd) || maxAuthorizedSpendUsd <= 0) throw new Error('--max-spend-usd must be positive');
  const output = resolve(value(args, '--output'));
  if (!output.endsWith('.json') || output === parse(output).root || output === resolve(process.cwd())) throw new Error('--output must name a bounded JSON file');
  const receipt = await runStage2RoutingSmokeV2({
    expectedPlanHash: value(args, '--plan-hash'),
    maxAuthorizedSpendUsd,
    operatorId: value(args, '--operator-id'),
    confirmedAt: new Date().toISOString(),
    environment: process.env,
  });
  const partial = `${output}.partial`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(partial, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await rm(output, { force: true });
  await rename(partial, output);
  const rows = Array.isArray(receipt.rows) ? receipt.rows as Array<Record<string, unknown>> : [];
  process.stdout.write(`${JSON.stringify({
    output,
    planHash: receipt.planHash,
    receiptHash: receipt.receiptHash,
    actualProviderCostUsd: receipt.actualProviderCostUsd,
    rows: rows.map((row) => ({ rowId: row.rowId, transportDisposition: (row.run as Record<string, unknown>)?.disposition, routingDisposition: (row.routingEvaluation as Record<string, unknown>)?.disposition })),
  })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
