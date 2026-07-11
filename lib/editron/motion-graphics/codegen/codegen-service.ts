/**
 * MG Codegen — the codegen service (E0 Phase C). The harness that turns one moment into a VALIDATED
 * component, or a signal to place the Tier-A engine form (Law 2). §2 pipeline:
 *   assemble prompt → model writes a component → scan (1 repair) → compile (fail → fallback)
 *   → render-probe + judge (score < threshold → 1 revision) → else fallback.
 *
 * Impurity is INJECTED (writeComponent = the model, compile = tsc, evaluate = render-probe + vision judge),
 * so this is testable with fakes and model-agnostic: Claude in production, GLM/grok in the eval (Rule 35 —
 * the prompt is tuned on the cheap model; Claude is spent only on real moments). Never throws. Every stage
 * writes a receipt (§7).
 *
 * The prompt puts the moment DATA LAST (Rule 35). The generated component reads `brand` as a runtime prop,
 * so it is brand-agnostic in structure — the mapped Brand (Phase A) is injected at render, not baked here.
 */

import { createHash } from 'node:crypto';

import { scanCode, type ScanResult } from './scan';
import { PRIMITIVE_API, hardRules, E0_COMPOSITION_GUIDE, KIT_IMPORT_PREAMBLE } from './prompt';
import type { MgGenerateResult, MgMomentInput, MgReceipt } from './types';

/** Bumped when the kit or prompt changes — part of the cache key so stale code never gets reused. */
export const KIT_VERSION = 'e0.1';
const DEFAULT_JUDGE_THRESHOLD = 7.5; // ← spec §11 (ship at 7.5, tune on the first 50 moments)

export interface CodegenDeps {
  /** Call the model with the assembled prompt → the component source. (Claude prod / GLM eval.) */
  writeComponent: (prompt: string) => Promise<string>;
  /** Type-check the component against the kit. */
  compile: (code: string) => Promise<{ ok: boolean; error?: string }>;
  /** Render 2 probe stills over a real footage frame → vision-judge → score + issues. */
  evaluate: (code: string, moment: MgMomentInput) => Promise<{ score: number; issues: string[] }>;
  judgeThreshold?: number;
}

function durationFrames(input: MgMomentInput): number {
  return Math.max(1, Math.round(input.window.endFrame - input.window.startFrame));
}

/** The moment data block — put LAST in the prompt (Rule 35). Describes the data SHAPE + format, NOT the
 *  literal values (those arrive as `data` props at render — Law 5 — and giving literals invites baking). */
function momentData(input: MgMomentInput): string {
  const { window, anchors, contentPayload: p, license } = input;
  const lines = [
    `clip length: ~${durationFrames(input)} frames @ ${window.fps}fps (read from useVideoConfig)`,
    `license: ${license.kind} (${license.claimStrength ?? 'assertive'})`,
  ];
  const fields: string[] = [];
  if (typeof p.value === 'number') fields.push(`value: a number${p.suffix ? ` shown with suffix "${p.suffix}"` : ''}`);
  if (p.label) fields.push('label: a short context string');
  if (p.comparison?.length) fields.push(`comparison: ${p.comparison.length} quantities, each {label, value}`);
  if (p.phrase) fields.push(`phrase: a short statement${p.accentWord ? ' with one accentWord to highlight' : ''}`);
  lines.push(`data props (read from \`data\`, NEVER bake the literals): ${fields.join('; ') || 'none'}`);
  if (anchors.wordFrames?.length) lines.push(`word anchors: ${anchors.wordFrames.length} word-onset frames (sync reveals to them)`);
  if (anchors.beatFrames?.length) lines.push(`beat anchors: ${anchors.beatFrames.length} beat frames`);
  return lines.join('\n');
}

/** Assemble the full codegen prompt (proven scaffolding + this moment's data, data-last). */
export function buildCodegenPrompt(input: MgMomentInput): string {
  return `<role>
You are a motion-graphics engineer. Write ONE Remotion component that visualizes the data moment below as a bespoke, on-brand, TRANSPARENT motion graphic to sit OVER footage — using ONLY the kit. Return ONLY the component source (no prose, no markdown fences).
</role>

${PRIMITIVE_API}

${hardRules(durationFrames(input))}

${E0_COMPOSITION_GUIDE}

<moment_data>
${momentData(input)}
</moment_data>`;
}

/**
 * Make the component's imports deterministic. The model is told not to write imports, but it omits or mangles
 * them ~half the time (the eval proved it), and an import-less component fails to compile → needless Tier-A
 * fallback. So: STRIP any import lines the model wrote (single- or multi-line), then PREPEND the canonical kit
 * block. Runs AFTER the scan (which sees the model's raw output, so a forbidden import is still caught) and
 * BEFORE compile/render. Idempotent, and the prepended block re-passes the scan's import whitelist.
 */
export function applyImportPreamble(code: string): string {
  const body = code
    // single-line: `import X from 'y';`, `import {a, b} from 'y';`, `import 'y';`, `import type {..} from 'y';`
    .replace(/^[ \t]*import\b[^;'"]*['"][^'"]*['"][ \t]*;?[ \t]*$/gm, '')
    // multi-line braced: `import {\n a,\n b\n} from 'y';`
    .replace(/^[ \t]*import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]*['"][ \t]*;?[ \t]*$/gm, '')
    .trimStart();
  return `${KIT_IMPORT_PREAMBLE}\n\n${body}`;
}

/** Cache key / receipt id: hash of everything that determines the output (§7). Identical moments never
 *  re-generate; a prop-only change re-renders from the same code (Law 5). */
export function promptHash(input: MgMomentInput): string {
  const p = input.contentPayload;
  // STRUCTURE, not values: value/label/anchor/duration edits re-render from the SAME code (Law 5), so they
  // must NOT change the cache key. Key on the SHAPE (which fields exist), the suffix, and the brand tokens.
  const salient = {
    mode: input.mode,
    licenseKind: input.license.kind,
    shape: {
      value: typeof p.value === 'number',
      suffix: p.suffix ?? '',
      label: !!p.label,
      comparison: p.comparison?.length ?? 0,
      phrase: !!p.phrase,
      accentWord: !!p.accentWord,
    },
    colors: input.brand.colors,
    type: input.brand.type,
    motion: input.brand.motion,
    kit: KIT_VERSION,
  };
  return createHash('sha256').update(JSON.stringify(salient)).digest('hex');
}

/**
 * Generate one moment. Never throws. Every gate degrades to the Tier-A engine fallback (Law 2): the worst
 * case is a plain, correct graphic — never a broken one.
 */
export async function generateMoment(input: MgMomentInput, deps: CodegenDeps): Promise<MgGenerateResult> {
  const threshold = deps.judgeThreshold ?? DEFAULT_JUDGE_THRESHOLD;
  const receipt: MgReceipt = {
    momentId: input.momentId,
    promptHash: promptHash(input),
    attempts: 0,
    scans: [],
    compiled: false,
    outcome: 'fallback',
  };
  const basePrompt = buildCodegenPrompt(input);

  const attempt = async (note?: string): Promise<{ code: string; scan: ScanResult }> => {
    receipt.attempts += 1;
    const prompt = note ? `${basePrompt}\n\n<previous_attempt_feedback>\n${note}\n</previous_attempt_feedback>` : basePrompt;
    let code = '';
    try {
      code = await deps.writeComponent(prompt);
    } catch {
      const scan: ScanResult = { ok: false, reason: 'model call failed' };
      receipt.scans.push({ passed: false, reason: scan.reason });
      return { code: '', scan };
    }
    const scan = scanCode(code);
    receipt.scans.push({ passed: scan.ok, reason: scan.reason });
    return { code, scan };
  };

  const fallback = (reason: string): MgGenerateResult => {
    receipt.outcome = 'fallback';
    receipt.fallbackReason = reason;
    return { status: 'fallback', fallbackReason: reason, receipt };
  };

  // 1. generate + scan (1 repair)
  let { code, scan } = await attempt();
  if (!scan.ok) {
    ({ code, scan } = await attempt(`Your previous output was rejected: ${scan.reason} Fix ONLY that and return the full corrected component.`));
  }
  if (!scan.ok) return fallback(`scan: ${scan.reason}`);
  // Imports become deterministic here — the model authored only the body; the harness owns the import block.
  code = applyImportPreamble(code);

  // 2. compile
  const compiled = await deps.compile(code);
  receipt.compiled = compiled.ok;
  if (!compiled.ok) {
    receipt.compileError = compiled.error;
    return fallback(`compile: ${(compiled.error ?? 'type error').slice(0, 120)}`);
  }

  // 3. render-probe + judge (1 revision on a low score)
  const ev = await deps.evaluate(code, input);
  receipt.judgeScore = ev.score;
  receipt.judgeIssues = ev.issues;
  if (ev.score < threshold) {
    const rev = await attempt(`A design reviewer scored your output ${ev.score}/10. Issues: ${ev.issues.join('; ')}. Revise to fix them; return the full component.`);
    if (!rev.scan.ok) return fallback(`revision scan: ${rev.scan.reason}`);
    const revCode = applyImportPreamble(rev.code);
    const rc = await deps.compile(revCode);
    receipt.compiled = rc.ok;
    if (!rc.ok) {
      receipt.compileError = rc.error;
      return fallback('revision compile failed');
    }
    const ev2 = await deps.evaluate(revCode, input);
    receipt.judgeScore = ev2.score;
    receipt.judgeIssues = ev2.issues;
    if (ev2.score < threshold) return fallback(`judge ${ev2.score} < ${threshold}`);
    code = revCode;
  }

  receipt.outcome = 'generated';
  return { status: 'generated', code, receipt };
}
