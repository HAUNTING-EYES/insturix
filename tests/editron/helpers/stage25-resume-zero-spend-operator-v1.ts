import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  STAGE25_RESUME_ZERO_SPEND_CREDENTIAL_NAMES_V1,
  STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1,
  finalizeStage25ResumeZeroSpendGateV1,
} from "../../../lib/editron/research/open-ended-planner/stage25-resume-zero-spend-gate-v1";
import { hashCanonicalJsonV1 }
  from "../../../lib/editron/research/open-ended-planner/contracts-v1";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const VITEST_CLI = require.resolve("vitest/vitest.mjs");
const VITEST_PACKAGE = require.resolve("vitest/package.json");
const SOURCE_SCOPES = [
  "lib/editron",
  "tests/editron",
  "components/editron",
  "package.json",
  "pnpm-lock.yaml",
] as const;

export async function runStage25ResumeZeroSpendOperatorV1(input: Readonly<{
  workspaceRoot: string;
  artifactParent: string;
}>): Promise<Readonly<Record<string, unknown>>> {
  const commitSha = await git(input.workspaceRoot, ["rev-parse", "HEAD"]);
  const treeSha = await git(input.workspaceRoot, ["rev-parse", "HEAD^{tree}"]);
  const status = await git(input.workspaceRoot, [
    "status", "--porcelain=v1", "--untracked-files=all", "--", ...SOURCE_SCOPES,
  ]);
  const relevantStatusEntries = lines(status);
  const tracked = lines(await git(input.workspaceRoot, [
    "ls-files", "-s", "--", ...SOURCE_SCOPES,
  ]));
  if (!tracked.length) throw new Error("STAGE25_RESUME_OPERATOR_SOURCE_SCOPE_EMPTY");

  const executionId = `stage25-resume-zero-spend-${commitSha.slice(0, 9)}-v1`;
  const executionRoot = path.resolve(input.artifactParent, executionId);
  await fs.mkdir(input.artifactParent, { recursive: true });
  try {
    await fs.mkdir(executionRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`STAGE25_RESUME_OPERATOR_EXECUTION_EXISTS:${executionRoot}`);
    }
    throw error;
  }
  const reportPath = path.join(executionRoot, "vitest-report.json");
  const receiptPath = path.join(executionRoot, "readiness-receipt.json");
  const environment: NodeJS.ProcessEnv = { ...process.env, CI: "1" };
  for (const name of STAGE25_RESUME_ZERO_SPEND_CREDENTIAL_NAMES_V1) {
    delete environment[name];
  }
  const startedAt = new Date().toISOString();
  await execFileAsync(process.execPath, [
    VITEST_CLI,
    "run",
    ...STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1,
    "--reporter=json",
    `--outputFile=${reportPath}`,
  ], {
    cwd: input.workspaceRoot,
    env: environment,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const completedAt = new Date().toISOString();
  const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as unknown;
  const vitestPackage = JSON.parse(
    await fs.readFile(VITEST_PACKAGE, "utf8"),
  ) as { version?: unknown };
  if (typeof vitestPackage.version !== "string" || !vitestPackage.version.trim()) {
    throw new Error("STAGE25_RESUME_OPERATOR_VITEST_VERSION_INVALID");
  }
  const receipt = finalizeStage25ResumeZeroSpendGateV1({
    source: {
      commitSha,
      treeSha,
      relevantScopeSha256: hashCanonicalJsonV1(tracked),
      relevantTrackedFileCount: tracked.length,
      relevantStatusEntries,
    },
    toolchain: {
      nodeVersion: process.version,
      vitestVersion: vitestPackage.version,
    },
    testRun: {
      startedAt,
      completedAt,
      report,
      runnerExitCode: 0,
      automaticRetryCount: 0,
      credentialNamesScrubbed: [...STAGE25_RESUME_ZERO_SPEND_CREDENTIAL_NAMES_V1],
      providerTransportMode: "TEST_STUBS_ONLY_NO_PROVIDER_ROUTE",
      networkObservation: "NOT_PACKET_CAPTURED",
      paidProviderDispatchAuthorized: false,
    },
  });
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return {
    executionId,
    executionRoot,
    reportPath,
    receiptPath,
    receiptSha256: receipt.receiptSha256,
  };
}

async function git(workspaceRoot: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd: workspaceRoot,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}

function lines(value: string): string[] {
  return value ? value.split(/\r?\n/).filter(Boolean) : [];
}

async function main(): Promise<void> {
  const artifactParent = process.argv[2];
  if (!artifactParent) {
    throw new Error("USAGE: stage25-resume-zero-spend-operator-v1 <artifact-parent>");
  }
  const result = await runStage25ResumeZeroSpendOperatorV1({
    workspaceRoot: process.cwd(),
    artifactParent: path.resolve(artifactParent),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
