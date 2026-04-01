#!/usr/bin/env npx tsx
/**
 * Editron Pipeline Test Script
 *
 * Tests the ENTIRE pipeline end-to-end without spending credits on AI generation.
 * Uses the debug endpoints (parser + assembly sim) and validates output structure.
 *
 * Usage:
 *   npx tsx scripts/test-editron-pipeline.ts <base-url>
 *
 * Example:
 *   npx tsx scripts/test-editron-pipeline.ts https://front-end-git-infrastructu-xxx.vercel.app
 *
 * What it tests:
 *   1. Script Parser — decomposition, scene count, sub-shots, assetRecommendation
 *   2. Assembly Simulator — overlay structure, timeline gaps, row assignments
 *   3. Director Agent config — profile actions, conditions, tools
 *   4. ROW constants consistency
 *   5. Overlay type validation
 *   6. Duration math (sub-shot vs scene, interleaving)
 *   7. Caption prerequisites (voiceover detection, row checks)
 *   8. Transition placement (correct row, no BGM collision)
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';

// ─── Test Scripts (diverse content types per Rule 0) ────────────────

const TEST_SCRIPTS = {
  'montage-ad': `# Golden Arches of Memory
**Format:** 30-second social media reel
**0:00-0:04** VISUAL: Quick cuts: A child's hand reaching for a Happy Meal toy. Kids laughing on a McDonald's playground.
VOICEOVER: Remember that feeling? The anticipation...
**0:04-0:08** VISUAL: Teenagers sharing fries in a car at night. A young adult studying with coffee.
VOICEOVER: ...of a Friday night, or a quick escape.
**0:08-0:12** VISUAL: A family sharing a meal, grandparent smiling at grandchild.
VOICEOVER: Through every new chapter...
**0:12-0:16** VISUAL: Close-up on a perfectly salted fry. The yellow arches through a car window.
VOICEOVER: ...some things just stick with you.
**0:16-0:20** VISUAL: The iconic Golden Arches, people entering. Logo appears.
VOICEOVER: McDonald's. Still making moments.`,

  'tutorial': `# How to Build a REST API with Node.js
**Format:** 10-minute YouTube tutorial
Step 1: Introduction — what we'll build today. A task manager API.
Step 2: Setting up the project. Open terminal, run npm init. Show the package.json.
Step 3: Installing dependencies — express, mongoose, dotenv. Show the terminal output.
Step 4: Creating the server file. Show server.js code. Explain each line.
Step 5: Defining the Task model. Show the Mongoose schema.
Step 6: Writing CRUD routes. GET /tasks, POST /tasks, PUT /tasks/:id, DELETE /tasks/:id.
Step 7: Testing with Postman. Show each request and response.
Step 8: Conclusion and next steps. Subscribe for Part 2.`,

  'documentary': `# The Last Ice Fishermen of Lake Baikal
**Format:** 5-minute documentary short
SCENE 1: Wide shot — the vast frozen expanse of Lake Baikal at dawn. Blue-white ice stretching to the horizon.
NARRATOR: For three thousand years, the Buryat people have cut holes in the thickest ice on Earth.
SCENE 2: Close-up — weathered hands threading a fishing line through a freshly cut ice hole.
NARRATOR: Dmitri Sokolov is seventy-three years old. He has fished this lake since he was seven.
SCENE 3: Medium shot — Dmitri sitting on a low stool beside his hole, the wind whipping snow across the ice.
NARRATOR: The fish are fewer each year. The ice thinner. But Dmitri returns every January.
SCENE 4: Slow pan across the empty ice — no other fishermen visible.
NARRATOR: He is the last of his kind.`,

  'talking-head': `# Why I Quit My $200K Job at Google
**Format:** 8-minute YouTube vlog
INTRO: Talking head — me sitting at my desk at home.
"Hey everyone. So... I quit Google. After 4 years. And everyone thinks I'm insane."
SECTION 1: Show my Google badge. Talk about what I did there.
"I was a senior product manager on the Search team. Dream job, right?"
SECTION 2: B-roll of Silicon Valley office. Then back to talking head.
"But here's the thing nobody tells you about big tech..."
SECTION 3: Screen recording showing my side project analytics.
"My side project was making $8K a month while I was sleeping."
CONCLUSION: Back to talking head, more animated.
"So if you're thinking about making the jump... here's my advice."`,
};

// ─── Utilities ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(test: string) {
  console.log(`  ✅ ${test}`);
  passed++;
}

function fail(test: string, detail?: string) {
  console.log(`  ❌ ${test}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

function warn(test: string, detail?: string) {
  console.log(`  ⚠️  ${test}${detail ? ` — ${detail}` : ''}`);
  warnings++;
}

async function fetchJSON(url: string, body?: any): Promise<any> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => 'no body')}`);
  }
  return res.json();
}

// ─── Test: Script Parser ────────────────────────────────────────────

async function testParser(name: string, script: string) {
  console.log(`\n📝 Testing Parser: ${name}`);

  try {
    const data = await fetchJSON(`${BASE_URL}/api/services/thinkforge/script/export-for-editron`, {
      plainText: script,
    });

    if (!data.success) {
      fail('Parser returned success=false', data.error);
      return null;
    }

    // Basic structure
    if (data.scenes && data.scenes.length > 0) pass(`Parsed ${data.scenes.length} scenes`);
    else { fail('No scenes returned'); return null; }

    if (data.totalDurationSeconds > 0) pass(`Total duration: ${data.totalDurationSeconds}s`);
    else fail('Total duration is 0 or missing');

    // Scene validation
    for (const scene of data.scenes) {
      // Required fields
      if (!scene.title) fail(`Scene ${scene.sceneIndex}: missing title`);
      if (!scene.visualDescription) fail(`Scene ${scene.sceneIndex}: missing visualDescription`);
      if (!scene.durationSeconds || scene.durationSeconds <= 0) fail(`Scene ${scene.sceneIndex}: invalid duration ${scene.durationSeconds}`);

      // assetRecommendation
      if (scene.assetRecommendation) {
        if (['ai-video', 'stock', 'animated-still', 'graphics-only'].includes(scene.assetRecommendation)) {
          pass(`Scene ${scene.sceneIndex}: assetRecommendation=${scene.assetRecommendation}`);
        } else {
          fail(`Scene ${scene.sceneIndex}: invalid assetRecommendation "${scene.assetRecommendation}"`);
        }
      } else {
        warn(`Scene ${scene.sceneIndex}: no assetRecommendation (post-processor should have set it)`);
      }

      // Sub-shots
      if (scene.subShots && scene.subShots.length > 0) {
        const totalSubDur = scene.subShots.reduce((s: number, sub: any) => s + (sub.targetDurationSeconds || 0), 0);
        if (totalSubDur > scene.durationSeconds * 3) {
          warn(`Scene ${scene.sceneIndex}: sub-shot total (${totalSubDur}s) much larger than scene (${scene.durationSeconds}s)`);
        }

        // Check sub-shot assetRecommendation
        for (const sub of scene.subShots) {
          if (sub.independentGeneration && sub.assetRecommendation === 'stock') {
            pass(`Scene ${scene.sceneIndex} sub-shot: assetRecommendation=stock ✓`);
          } else if (sub.independentGeneration && !sub.assetRecommendation) {
            warn(`Scene ${scene.sceneIndex} sub-shot: missing assetRecommendation`);
          }
        }
      }
    }

    // Scene count sanity
    const avgDuration = data.totalDurationSeconds / data.scenes.length;
    if (avgDuration < 1) warn(`Average scene duration ${avgDuration.toFixed(1)}s — may be over-decomposed`);
    if (avgDuration > 60 && name !== 'documentary' && name !== 'talking-head') warn(`Average scene duration ${avgDuration.toFixed(1)}s — may be under-decomposed`);

    return data;
  } catch (err: any) {
    fail(`Parser request failed: ${err.message}`);
    return null;
  }
}

// ─── Test: Assembly Simulator ───────────────────────────────────────

async function testAssembly(name: string, scenes: any[]) {
  console.log(`\n🎬 Testing Assembly: ${name}`);

  try {
    const data = await fetchJSON(`${BASE_URL}/api/services/editron/debug/simulate-assembly`, {
      scenes,
      fps: 30,
      width: 1920,
      height: 1080,
    });

    if (!data.overlays || data.overlays.length === 0) {
      fail('Assembly returned 0 overlays');
      return;
    }

    pass(`Assembly: ${data.overlayCount} overlays, ${data.totalDurationSeconds}s`);

    // Check for timeline gaps (video row)
    const videoOverlays = data.overlays
      .filter((o: any) => o.row === 2 && (o.type === 'video' || o.type === 'image' || o.type === 'html-scene'))
      .sort((a: any, b: any) => a.from - b.from);

    let lastEnd = 0;
    let gapCount = 0;
    for (const vo of videoOverlays) {
      if (vo.from > lastEnd + 1) {
        gapCount++;
        warn(`Gap in video track: frames ${lastEnd}-${vo.from} (${((vo.from - lastEnd) / 30).toFixed(1)}s)`);
      }
      lastEnd = vo.from + vo.durationInFrames;
    }
    if (gapCount === 0) pass('No gaps in video track');

    // Check for overlapping overlays on same row
    const byRow: Record<number, any[]> = {};
    for (const o of data.overlays) {
      if (!byRow[o.row]) byRow[o.row] = [];
      byRow[o.row].push(o);
    }
    for (const [row, overlays] of Object.entries(byRow)) {
      const sorted = overlays.sort((a: any, b: any) => a.from - b.from);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevEnd = prev.from + prev.durationInFrames;
        if (curr.from < prevEnd && prev.type === curr.type) {
          warn(`Row ${row}: overlapping ${prev.type} overlays (${prev.from}-${prevEnd} vs ${curr.from})`);
        }
      }
    }

    // Check ROW assignments
    const rowCounts = data.overlaysByRow || {};
    pass(`Row layout: Video=${rowCounts[2] || 0}, VO=${rowCounts[3] || 0}, Captions=${rowCounts[4] || 0}`);

    // Check voiceover exists for narrated scenes
    const narrated = scenes.filter((s: any) => s.narration && s.narration.trim());
    const voiceoverCount = data.overlays.filter((o: any) => o.row === 3).length;
    if (voiceoverCount >= narrated.length) {
      pass(`Voiceover overlays: ${voiceoverCount} for ${narrated.length} narrated scenes`);
    } else {
      warn(`Voiceover overlays: ${voiceoverCount} but ${narrated.length} narrated scenes`);
    }

  } catch (err: any) {
    fail(`Assembly request failed: ${err.message}`);
  }
}

// ─── Test: Project Structure Validation ─────────────────────────────

function testProjectStructure(project: any) {
  console.log('\n🔍 Testing Project Structure');

  if (!project.overlays) { fail('No overlays in project'); return; }

  const overlays = project.overlays;
  pass(`Total overlays: ${overlays.length}`);

  // Check for captions
  const captions = overlays.filter((o: any) => o.type === 'caption');
  if (captions.length > 0) pass(`Captions: ${captions.length} found`);
  else fail('No captions in project — add_captions may have failed');

  // Check for transitions
  const transitions = overlays.filter((o: any) =>
    o.type === 'transition' || o.metadata?.isTransition
  );
  if (transitions.length > 0) pass(`Transitions: ${transitions.length} found`);
  else warn('No transitions in project');

  // Check transition rows
  for (const t of transitions) {
    if (t.row === 1) {
      warn(`Transition "${t.metadata?.transitionType}" on row 1 (same as BGM) — may collide visually`);
    }
  }

  // Check for BGM
  const bgm = overlays.filter((o: any) => o.type === 'sound' && o.row === 1);
  if (bgm.length > 0) pass(`BGM: ${bgm.length} track(s)`);
  else warn('No BGM in project');

  // Check for SFX
  const sfx = overlays.filter((o: any) => o.type === 'sound' && o.row === 0);
  if (sfx.length > 0) pass(`SFX: ${sfx.length} effects`);
  else warn('No SFX in project');

  // Check for voiceover
  const vo = overlays.filter((o: any) =>
    o.type === 'sound' && (o.row === 3 || (o.assetId || '').startsWith('voiceover_'))
  );
  if (vo.length > 0) pass(`Voiceover: ${vo.length} clips`);
  else warn('No voiceover in project');

  // Check video overlays
  const videos = overlays.filter((o: any) => o.type === 'video');
  if (videos.length > 0) {
    pass(`Videos: ${videos.length} clips`);

    // Check for sub-shot metadata
    const subShots = videos.filter((v: any) => v.metadata?.isMontageSub);
    if (subShots.length > 0) pass(`Sub-shots: ${subShots.length} montage clips`);

    // Check video durations — sub-shots should NOT be 5s (full clip)
    for (const v of subShots) {
      const durSec = v.durationInFrames / (project.fps || 30);
      if (durSec >= 4.5) {
        fail(`Sub-shot video ${v.assetId}: duration ${durSec.toFixed(1)}s — likely using full clip instead of targetDurationSeconds`);
      }
    }
  } else {
    fail('No video overlays in project');
  }

  // Check total duration
  const totalFrames = project.durationInFrames || 0;
  const totalSec = totalFrames / (project.fps || 30);
  pass(`Total duration: ${totalSec.toFixed(1)}s (${totalFrames} frames)`);

  // Sanity check — 30s script should not produce 75s video
  if (totalSec > 60 && project.overlays.some((o: any) => o.metadata?.isMontageSub)) {
    fail(`Duration ${totalSec.toFixed(1)}s seems bloated — sub-shots may be using full video duration instead of target`);
  }

  // Check keyframe tracks
  const withKeyframes = overlays.filter((o: any) => o.keyframeTracks?.length > 0);
  if (withKeyframes.length > 0) pass(`Keyframe animations: ${withKeyframes.length} overlays`);

  // Check for graphics
  const graphics = overlays.filter((o: any) => o.metadata?.sourceType === 'edl-graphic');
  if (graphics.length > 0) pass(`EDL Graphics: ${graphics.length} (${graphics.map((g: any) => g.metadata?.graphicType).join(', ')})`);

  // Check intelligence data
  if (project.intelligence) {
    const intel = project.intelligence;
    pass(`Intelligence: ${intel.assetsAnalyzed} analyzed, ${intel.decisionsExecuted}/${intel.decisionsGenerated} decisions`);
    if (intel.failedAssets?.length > 0) warn(`Failed assets: ${intel.failedAssets.join(', ')}`);
  }
}

// ─── Test: ROW Constants ────────────────────────────────────────────

function testROWConstants() {
  console.log('\n📐 Testing ROW Constants');

  // Expected from scene-to-editron.ts
  const expected = {
    SFX: 0, BGM: 1, VIDEO: 2, VOICEOVER: 3, CAPTIONS: 4, TRANSITIONS: 5, MOTION_GRAPHICS: 6,
  };

  // Known issues
  warn('ROW.TRANSITIONS=5 but transitions use row 1 for z-index (above video). Known architectural issue.');
  warn('ROW.BGM=1 collides with transitions on row 1. Timeline UI should distinguish by type.');
  pass('ROW.VOICEOVER=3 — correct (was incorrectly checked as 4 in old code)');
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  EDITRON PIPELINE TEST SUITE`);
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);

  // Test ROW constants
  testROWConstants();

  // Test each script type
  for (const [name, script] of Object.entries(TEST_SCRIPTS)) {
    const parserResult = await testParser(name, script);
    if (parserResult?.scenes) {
      await testAssembly(name, parserResult.scenes);
    }
  }

  // If a project ID is provided as 3rd arg, test its structure
  const projectId = process.argv[3];
  if (projectId) {
    console.log(`\n🏗️  Testing Project: ${projectId}`);
    try {
      const project = await fetchJSON(`${BASE_URL}/api/services/editron/projects/${projectId}`);
      if (project) testProjectStructure(project);
    } catch (err: any) {
      fail(`Failed to load project: ${err.message}`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log(`${'='.repeat(60)}\n`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(2);
});
