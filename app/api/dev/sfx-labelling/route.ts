/**
 * S2-L1 — INTERNAL REVIEWER TOOL (development-only, not production).
 *
 * Smallest internal reviewer page for labelling the seeded 64 SFX
 * opportunities. Dev-guarded: refuses to run outside non-production envs
 * unless SFX_LABELLING_ALLOW=true is set explicitly (the operator's call, not
 * a product feature flag).
 *
 * - GET  /api/dev/sfx-labelling            → reviewer HTML page
 * - GET  /api/dev/sfx-labelling/candidates → JSON candidate set for one
 *                                            opportunity (audition + silence)
 * - POST /api/dev/sfx-labelling/observation→ saves ONE reviewer's observation
 *                                            to .calibration-temp/
 *                                            sfx-eval-labelling/observations
 *                                            /<oppId>/<reviewerId>.json
 *                                            (independent per reviewer; never
 *                                            overwrite another reviewer)
 *
 * The page embeds the single-source client script from
 * lib/pipeline/sfx-labelling-ui.ts (REVIEWER_PAGE_SCRIPT) — the same string
 * the browser test executes, so UI behavior is covered by tests.
 *
 * No selector access, no scoring, no semantic. This is a human-labelling
 * input channel only — it never reads or writes selector behavior.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

import { BUNDLED_SFX_CATALOG } from '@/lib/pipeline/sfx-catalog';
import { buildLabellingCandidateSet, isValidOpportunityObservation } from '@/lib/pipeline/sfx-labelling';
import { REVIEWER_PAGE_SCRIPT } from '@/lib/pipeline/sfx-labelling-ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEV_GUARD = process.env.NODE_ENV === 'development' || process.env.SFX_LABELLING_ALLOW === 'true';
const STORE_ROOT = path.resolve(process.cwd(), '.calibration-temp', 'sfx-eval-labelling');

function denied(): NextResponse {
  return NextResponse.json({ error: 'SFX labelling tool is not enabled outside development.', code: 'DEV_ONLY' }, { status: 403 });
}

const OPPORTUNITY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const REVIEWER_ID_PATTERN = /^[a-zA-Z0-9_.@-]{1,80}$/;

async function loadCorpus() {
  const raw = await readFile(
    path.resolve(process.cwd(), 'tests', 'fixtures', 'sfx-eval', 'isolated-opportunities.json'),
    'utf8',
  );
  return JSON.parse(raw) as {
    isolated: Array<{
      context: {
        opportunityId: string;
        role: { state: string; value?: string };
        surface?: { state: string; value?: string };
        direction?: { state: string; value?: string };
        motionSpeed?: { state: string; value?: string };
        material?: { state: string; value?: string };
        contextualNote?: string;
      };
      label: unknown;
    }>;
  };
}

export async function GET(request: NextRequest) {
  if (!DEV_GUARD) return denied();

  const url = new URL(request.url);
  const sub = url.pathname.split('/').filter(Boolean).pop();

  if (sub === 'candidates') {
    const opportunityId = url.searchParams.get('opportunityId') ?? '';
    if (!OPPORTUNITY_ID_PATTERN.test(opportunityId)) {
      return NextResponse.json({ error: 'invalid opportunityId', code: 'INVALID' }, { status: 400 });
    }
    const corpus = await loadCorpus();
    const item = corpus.isolated.find((i) => i.context.opportunityId === opportunityId);
    if (!item) return NextResponse.json({ error: 'opportunity not found', code: 'NOT_FOUND' }, { status: 404 });

    const role = item.context.role.value as import('@/lib/pipeline/sfx-catalog').SfxCatalogEventRole;
    const surface = item.context.surface?.value;
    const set = buildLabellingCandidateSet(opportunityId, role, surface, { entries: BUNDLED_SFX_CATALOG.entries });
    return NextResponse.json({
      opportunityId,
      context: {
        role,
        surface,
        direction: item.context.direction?.value,
        motionSpeed: item.context.motionSpeed?.value,
        material: item.context.material?.value,
        note: item.context.contextualNote,
      },
      candidates: set.candidates,
    });
  }

  // Default: reviewer HTML page.
  const corpus = await loadCorpus();
  const opportunities = corpus.isolated.map((i) => ({
    opportunityId: i.context.opportunityId,
    role: i.context.role.value,
    surface: i.context.surface?.value,
    note: i.context.contextualNote,
  }));
  const html = reviewerPage(opportunities);
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function POST(request: NextRequest) {
  if (!DEV_GUARD) return denied();
  const observation = await request.json().catch(() => null);
  if (!isValidOpportunityObservation(observation)) {
    return NextResponse.json({ error: 'invalid observation', code: 'INVALID' }, { status: 400 });
  }
  const oppId = observation.opportunityId;
  const reviewerId = observation.reviewerId;
  if (!OPPORTUNITY_ID_PATTERN.test(oppId) || !REVIEWER_ID_PATTERN.test(reviewerId)) {
    return NextResponse.json({ error: 'invalid ids', code: 'INVALID' }, { status: 400 });
  }

  const dir = path.join(STORE_ROOT, 'observations', oppId);
  await mkdir(dir, { recursive: true });
  // Reviewer independence: per-reviewer file; never overwrite another reviewer.
  const file = path.join(dir, `${reviewerId}.json`);
  await writeFile(file, JSON.stringify(observation, null, 2), 'utf8');

  // Already-reviewed reviewers (so the page can show adjudication state).
  const reviewed = (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  return NextResponse.json({ saved: true, reviewerId, reviewed });
}

function reviewerPage(opportunities: Array<{ opportunityId: string; role?: string; surface?: string; note?: string }>) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>SFX Labelling (internal)</title>
<style>
body{background:#101012;color:#e8e6e1;font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px}
h1{font-size:18px;margin:0 0 4px}.hint{color:#9a978f;font-size:12px;margin-bottom:16px}
#list{display:grid;gap:14px;max-width:760px}
.opp{border:1px solid #2c2b29;border-radius:8px;padding:12px;background:#16161a}
.opp h2{font-size:14px;margin:0 0 4px}.meta{color:#9a978f;font-size:12px;margin-bottom:8px}
.cand{display:flex;gap:6px;align-items:center;border:1px solid #2c2b29;border-radius:6px;padding:6px;margin:4px 0}
.cand .name{flex:1;font-size:12px}
.lbl{font-size:12px}.lbl label{margin-right:6px}
input[type=checkbox]{accent-color:#d4a652}
input[type=text]{background:#0e0e10;color:#e8e6e1;border:1px solid #2c2b29;border-radius:6px;padding:7px 8px}
textarea{width:100%;box-sizing:border-box;background:#0e0e10;color:#e8e6e1;border:1px solid #2c2b29;border-radius:6px;font:12px monospace;padding:6px}
button{margin-top:8px;background:#d4a652;color:#0b0b0a;border:0;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer}
button:disabled{cursor:default;opacity:.55}
.reviewer-setup{border:1px solid #2c2b29;border-radius:8px;padding:12px;background:#16161a;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.reviewer-setup button{margin-top:0}
.reviewer-setup .status{flex-basis:100%}
.status{font-size:11px;color:#7a776f}
</style></head><body>
<h1>SFX labelling — internal reviewer</h1>
<div class="hint">Review each opportunity independently. The selector's choice is not shown. Mark UNKNOWN where a field is not perceptible. Save separate reviewer observations; adjudication is done separately.</div>
<section id="list"></section>
<script>
window.__SFX_LABELLING_OPPORTUNITIES__ = ${JSON.stringify(opportunities)};
</script>
<script>${REVIEWER_PAGE_SCRIPT}</script>
<script>
(function () {
  var container = document.getElementById('list');
  window.renderReviewerPage(container, {
    opportunities: window.__SFX_LABELLING_OPPORTUNITIES__,
    fetchImpl: window.fetch.bind(window),
    storage: window.localStorage
  });
})();
</script></body></html>`;
}
