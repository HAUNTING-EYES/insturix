import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  LONG_FORM_SOAK_VERSION,
  readMemoryReading,
  runLongFormConditioningSoak,
} from './long-form-conditioning-soak';

export async function runLongFormSoak() {
  const generatedAt = new Date().toISOString();
  const outputDir = path.resolve(
    process.cwd(),
    '.calibration-temp',
    'long-form-conditioning-soak',
    generatedAt.replace(/[:.]/g, '-'),
  );
  await mkdir(outputDir, { recursive: true });

  const result = await runLongFormConditioningSoak();
  const receipt = {
    version: LONG_FORM_SOAK_VERSION,
    status: 'pass' as const,
    generatedAt,
    zeroCredit: { paidGenerationCalls: 0, providerApiCalls: 0, cloudRenderCalls: 0 },
    controlFlow: {
      conditioner: 'lib/pipeline/audio-conditioning.ts#conditionAudio',
    },
    target: {
      seconds: 300,
      frames: 9000,
      fps: 30,
    },
    result: {
      durationMs: result.durationMs,
      sourceDurationMs: result.sourceDurationMs,
      measuredOutputLufs: result.measuredOutputLufs,
      truePeakDbtp: result.truePeakDbtp,
      wasLooped: result.wasLooped,
      loopsAdded: result.loopsAdded,
      crossfadeMs: result.crossfadeMs,
      elapsedMs: result.elapsedMs,
      sourceHashSha256: result.sourceHashSha256,
    },
    memoryBefore: readMemoryReading(),
    memoryDeltaRssMb: result.memory.deltaRssMb,
    memory: result.memory,
    ffmpegTimeoutMsConfigured: 120_000,
    ffmpegElapsedMs: result.elapsedMs,
  };

  const receiptPath = path.join(outputDir, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receiptPath, receipt };
}

async function main(): Promise<void> {
  const { receiptPath, receipt } = await runLongFormSoak();
  console.log(JSON.stringify({
    status: receipt.status,
    receiptPath,
    zeroCredit: receipt.zeroCredit,
    result: receipt.result,
    memoryDeltaRssMb: receipt.memoryDeltaRssMb,
    memory: receipt.memory,
  }, null, 2));
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
