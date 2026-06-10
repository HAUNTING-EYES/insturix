import { spawn } from "node:child_process";

const testFiles = [
  "tests/shared/project-links.test.ts",
  "tests/pipeline/storyboard-prompt-builder.test.ts",
  "tests/clickatron/think-to-click-context.test.ts",
  "tests/clickatron/context-contract.test.ts",
  "tests/clickatron/brand-prompt-context.test.ts",
  "tests/clickatron/thumbnail-commit-context.test.ts",
  "tests/brand-intelligence/brand-events.test.ts",
  "tests/brand-intelligence/brand-event-claims.test.ts",
  "tests/brand-intelligence/brand-event-scope.test.ts",
  "tests/brand-intelligence/brand-learning-worker.test.ts",
  "tests/editron/director-brand-scope.test.ts",
  "tests/editron/signal-driven-edge-cases.test.ts",
  "tests/uploaderx/video-publish-events.test.ts",
  "tests/uploaderx/platform-api-routes.test.ts",
  "tests/thinkforge/context-scope.test.ts",
  "tests/thinkforge/databank-ingress.test.ts",
  "tests/thinkforge/observer-ingress.test.ts",
  "tests/thinkforge/post-mortem-agent-promotion.test.ts",
  "tests/thinkforge/post-mortem-scope.test.ts",
];

const vitest = spawn("npx", ["vitest", "run", ...testFiles], {
  shell: process.platform === "win32",
  stdio: "inherit",
});

vitest.on("exit", (code, signal) => {
  if (signal) {
    console.error(`creative-chain tests terminated by ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
