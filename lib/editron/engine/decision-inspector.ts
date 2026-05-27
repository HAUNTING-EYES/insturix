import type { GridPointDecision, ScoringResult, OverlayCategory } from './utility-types';

export interface InspectorEntry {
  frame: number;
  timestampMs: number;
  winners: { category: OverlayCategory; overlayId: string; score: number; breakdown: string[] }[];
  topLosers: { overlayId: string; score: number; reason: string }[];
}

function formatConsiderations(result: ScoringResult): string[] {
  return result.considerationScores.map(
    (cs) =>
      `${cs.signalId}: ${cs.rawInput.toFixed(3)} → curve → ${cs.curveOutput.toFixed(3)} → comp → ${cs.compensated.toFixed(3)} (${cs.description})`,
  );
}

function findLossReason(result: ScoringResult): string {
  if (result.considerationScores.length === 0) return 'no valid signals';
  const worst = result.considerationScores.reduce((a, b) => (a.compensated < b.compensated ? a : b));
  if (worst.compensated < 0.1) return `vetoed by ${worst.signalId} (${worst.rawInput.toFixed(2)} → ${worst.compensated.toFixed(2)})`;
  return `outscored (best consideration: ${worst.signalId} at ${worst.compensated.toFixed(2)})`;
}

export function inspectGridPoint(decision: GridPointDecision): InspectorEntry {
  const winners: InspectorEntry['winners'] = [];
  const categories = Object.keys(decision.winners) as OverlayCategory[];

  for (const cat of categories) {
    const w = decision.winners[cat];
    if (!w) continue;
    winners.push({
      category: cat,
      overlayId: w.overlayId,
      score: w.totalScore,
      breakdown: formatConsiderations(w),
    });
  }

  const winnerIds = new Set(winners.map((w) => w.overlayId));
  const topLosers = decision.allScores
    .filter((r) => !winnerIds.has(r.overlayId) && r.totalScore > 0)
    .slice(0, 5)
    .map((r) => ({
      overlayId: r.overlayId,
      score: r.totalScore,
      reason: findLossReason(r),
    }));

  return {
    frame: decision.frame,
    timestampMs: decision.timestampMs,
    winners,
    topLosers,
  };
}

export function formatInspectorLog(entry: InspectorEntry): string {
  const lines: string[] = [];
  lines.push(`[Frame ${entry.frame} | ${(entry.timestampMs / 1000).toFixed(1)}s]`);

  if (entry.winners.length === 0) {
    lines.push('  No overlays selected');
    return lines.join('\n');
  }

  for (const w of entry.winners) {
    lines.push(`  ✓ ${w.category}: ${w.overlayId} (${w.score.toFixed(3)})`);
    for (const b of w.breakdown) {
      lines.push(`      ${b}`);
    }
  }

  if (entry.topLosers.length > 0) {
    lines.push('  runners-up:');
    for (const l of entry.topLosers) {
      lines.push(`    ✗ ${l.overlayId} (${l.score.toFixed(3)}) — ${l.reason}`);
    }
  }

  return lines.join('\n');
}

export function generateVideoReport(decisions: GridPointDecision[]): InspectorEntry[] {
  return decisions.map(inspectGridPoint);
}
