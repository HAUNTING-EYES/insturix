#!/usr/bin/env python3
"""
Scene Parser Evaluation Harness

Evaluates the LLM scene parser prompt against ground truth test scripts.
Runs multi-seed (seeds 1-10) and reports min/max/mean per scoring dimension.

Usage:
    python eval_scene_parser.py                    # All seeds (1-10)
    python eval_scene_parser.py --seed=1           # Single seed
    python eval_scene_parser.py --seeds=1,3,5,7    # Custom seeds
    python eval_scene_parser.py --verbose           # Show per-scene details
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv

# ─── Config ──────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
TEST_SCRIPTS_DIR = SCRIPT_DIR / "test-scripts"

# Scoring weights (sum to 1.0)
SCORE_WEIGHTS = {
    "scene_count": 0.15,
    "narration_quality": 0.25,
    "visual_quality": 0.20,
    "subshot_correctness": 0.10,
    "onscreen_text": 0.15,
    "transition_mapping": 0.15,
}

# Valid transition IDs (from llm-scene-parser.ts)
VALID_TRANSITIONS = {
    "dissolve", "dip-to-black", "dip-to-white", "flash", "blur-transition",
    "wipe-left", "wipe-right", "slide-up", "slide-down",
    "zoom-punch", "zoom-out", "whip-pan", "glitch", "film-burn",
    "iris-wipe", "soft-cut", "hard-cut", "smash-cut", "match-cut",
    "jump-cut", "cut-on-action",
}

# Banned words in visual descriptions (from RULE 3)
BANNED_VISUAL_WORDS = {
    "tracking", "dolly", "pan", "zoom", "follows", "sweeps", "split",
    "panels", "grid", "collage", "montage", "series", "diptych",
    "triptych", "then", "next", "afterward", "transitions to", "cuts to",
}

# Valid filter preset IDs (from filter-presets.ts)
VALID_FILTER_PRESETS = {
    "none", "retro", "vintage", "wesAnderson", "noir", "polaroid",
    "cinematic", "cool", "warm", "expired", "kodak", "super8",
    "teal-orange", "blade-runner", "neon-nights", "muted-doc",
    "golden-hour-pro", "desaturated-drama", "film-portra",
    "clean-corporate", "vivid", "warm-neutral",
}

# Valid scene types
VALID_SCENE_TYPES = {"continuous", "montage", "logo-reveal", "text-card", "talking-head"}

# Valid moods
VALID_MOODS = {
    "energetic", "calm", "serious", "playful", "mysterious",
    "dramatic", "inspirational", "neutral",
}


# ─── Prompt (extracted from llm-scene-parser.ts) ─────────────────

def build_scene_parser_prompt(script_text: str, art_style: str = "",
                               aspect_ratio: str = "",
                               target_duration: int = 0) -> str:
    """Build the XML-structured scene parser prompt matching llm-scene-parser.ts."""
    art_directive = (
        f"Art style for ALL scenes: {art_style}. Adapt every description to this style."
        if art_style
        else "Default art style: photorealistic cinematic with natural lighting. Maintain consistently."
    )
    aspect_directive = f"- Aspect ratio: {aspect_ratio}. Adjust composition and framing accordingly." if aspect_ratio else ""
    target_range = (
        f"{(target_duration + 7) // 8}-{(target_duration + 3) // 4}"
        if target_duration
        else "4-8"
    )
    duration_label = target_duration if target_duration else "30-60"

    # Filter preset IDs for the prompt
    filter_ids_str = ", ".join(sorted(VALID_FILTER_PRESETS - {"none"}))

    return f"""<role>
You are a senior video production director. You decompose client scripts into discrete scenes, where each scene represents ONE AI video generation call.
</role>

<task>
Parse the script provided in the <script> section below into structured scene objects. Each scene must have these fields:
- title: Short cinematic scene title (2-6 words)
- narration: ONLY voiceover/dialogue words spoken aloud. Empty string if none.
- visualDescription: Static image prompt. ONE primary subject, ONE setting, ONE frozen moment.
- videoMotionPrompt: How the still frame comes to life. Camera movement, subject micro-motion.
- musicDescription: Music/BGM mood and style. ONLY music.
- sfxDescription: Sound effects and ambient audio. No music.
- durationSeconds: Total duration in seconds.
- mood: One of: energetic, calm, serious, playful, mysterious, dramatic, inspirational, neutral
- imageQualityTokens: Style-appropriate quality descriptors for image gen.
- videoQualityTokens: Style-appropriate quality descriptors for video gen.
- sceneType: One of: continuous, montage, logo-reveal, text-card, talking-head
- assetRecommendation: Almost always "ai-video". Only "graphics-only" for data/chart scenes.
- generationUnitId: Group ID for scenes sharing one video gen call.
- primaryVisualForUnit: true if this is the primary visual for its generation unit.
- editDirections: Object with transition, filterPresetId, pacing, sfxCue, onScreenText, cameraRig.
- subShots: Array of sub-shots if scene has multiple quick cuts.

Also return:
- overallMusicPrompt: Overall BGM style for the entire video.
- characterDescriptions: Map of recurring character name to visual description.
- colorPalette: 3-8 specific color names from the visual identity.
- environmentNotes: 1-3 sentence description of the overall visual environment.
- globalEditDirections: Global editing instructions (colorGrade, pacing, narrativeArc, etc.)
- suggestedProfileCategory: Broad editing category (platform-native, industry-vertical, etc.)
</task>

<rules>
RULE 1 — FORMAT DETECTION (silent, do not output your detection):
A) Screenplay (INT./EXT. sluglines): sluglines = scene boundaries.
B) Voiceover (continuous prose): all prose = narration, INVENT visuals.
C) Two-column A/V: Visual = visualDescription, Audio = split narration + sfx + music.
D) Bullet-point brief: each bullet = one scene.
E) Timestamped ([00:00-00:05]): timestamps set durationSeconds.
F) Casual/conversational: parse intent from natural language.
G) Pre-decomposed storyboard: decompose multi-subject scenes.
H) ThinkForge output (Visuals/Audio/Camera/Music Direction subsections): Extract Visuals = visualDescription, Camera = videoMotionPrompt, Music Direction = musicDescription. Map transitions to IDs.

RULE 2 — NARRATION EXTRACTION PRIORITY:
1. Text labeled VO:/VOICEOVER:/NARRATOR: = extract verbatim
2. Quoted text after character name = extract quoted text
3. FORMAT B: all prose = narration
4. FORMAT C/H: spoken words in AUDIO section
5. Stage directions, camera notes, SFX = NEVER narration
6. Uncertain = "" (empty)

RULE 3 — VISUAL DESCRIPTION:
- ONE primary subject, ONE setting, ONE frozen moment
- Same subject + same camera = ONE scene
- Different subjects = ALWAYS SPLIT
- BANNED words: tracking, dolly, pan, zoom, follows, sweeps, split, panels, grid, collage, montage, series, diptych, triptych, then, next, afterward, transitions to, cuts to
- {art_directive}
{aspect_directive}

RULE 4 — GENERATION UNIT GROUPING:
Group by SUBJECT + LOCATION + VISUAL STYLE. Target: {target_range} scenes for a {duration_label}-second video.
Sub-shot Mode A (cheap): same subject = independentGeneration=false.
Sub-shot Mode B (expensive): different subjects = independentGeneration=true on every sub-shot.

RULE 5 — AUDIO SPLITTING:
musicDescription = music only. sfxDescription = SFX only. Never mix.

RULE 6 — ON-SCREEN TEXT:
Extract VERBATIM into editDirections.onScreenText. Do NOT rewrite or invent.

RULE 7 — TRANSITION MAPPING:
DISSOLVE="dissolve", FADE TO BLACK="dip-to-black", CUT TO="hard-cut", FLASH="flash", etc.
Valid IDs: dissolve, dip-to-black, dip-to-white, flash, blur-transition, wipe-left, wipe-right, slide-up, slide-down, zoom-punch, zoom-out, whip-pan, glitch, film-burn, iris-wipe, soft-cut, hard-cut, smash-cut, match-cut, jump-cut, cut-on-action.

RULE 8 — WHAT TO IGNORE: project overviews, creative briefs, style guides, production notes.

RULE 9 — EDIT DIRECTIONS: Return null for fields not in the script. Do NOT invent.

RULE 10 — QUALITY TOKENS: Must match art style AND scene content. Vary by scene.

RULE 11 — VIDEO MOTION: Describe ONLY what changes from the still image.

RULE 12 — DURATION: Timestamps = calculate. Narration = ~150 words/min + buffer. No data = default 5.

RULE 13 — FILTER PRESETS: Valid IDs: {filter_ids_str}

RULE 14 — SCENE TYPES: continuous, montage (MUST have subShots), logo-reveal, text-card, talking-head.
</rules>

<output_format>
Return a JSON object with this exact structure:
{{
  "scenes": [
    {{
      "title": "string",
      "narration": "string",
      "visualDescription": "string",
      "videoMotionPrompt": "string",
      "audioDescription": "string",
      "musicDescription": "string",
      "sfxDescription": "string",
      "durationSeconds": number,
      "mood": "string",
      "imageQualityTokens": "string",
      "videoQualityTokens": "string",
      "sceneType": "string",
      "assetRecommendation": "string",
      "generationUnitId": "string",
      "primaryVisualForUnit": boolean,
      "editDirections": {{
        "transition": {{"type": "string", "durationMs": number}} | null,
        "filterPresetId": "string" | null,
        "pacing": "string" | null,
        "sfxCue": "string" | null,
        "onScreenText": ["string"] | null,
        "cameraRig": "string" | null,
        "motionGraphicCue": "string" | null
      }},
      "subShots": [...] | null
    }}
  ],
  "overallMusicPrompt": "string",
  "characterDescriptions": {{}},
  "colorPalette": ["string"],
  "environmentNotes": "string",
  "globalEditDirections": {{...}} | null,
  "suggestedProfileCategory": "string"
}}
</output_format>

<script>
{script_text[:24000]}
{"[NOTICE: Script truncated at 24,000 characters.]" if len(script_text) > 24000 else ""}
</script>"""


# ─── Scoring Functions ───────────────────────────────────────────

def score_scene_count(actual: dict, expected: dict) -> float:
    """Score scene count accuracy. 1.0 if within +/- 1, degrades linearly."""
    actual_count = len(actual.get("scenes", []))
    expected_count = len(expected.get("expected_scenes", []))
    if expected_count == 0:
        return 1.0 if actual_count == 0 else 0.0
    diff = abs(actual_count - expected_count)
    if diff <= 1:
        return 1.0
    # Linear degradation: lose 0.2 per extra scene beyond tolerance
    return max(0.0, 1.0 - (diff - 1) * 0.2)


def score_narration_quality(actual: dict, expected: dict) -> float:
    """Score narration extraction quality. Checks for contamination and completeness."""
    actual_scenes = actual.get("scenes", [])
    expected_scenes = expected.get("expected_scenes", [])
    if not expected_scenes:
        return 1.0

    scores = []
    for i, exp_scene in enumerate(expected_scenes):
        if i >= len(actual_scenes):
            scores.append(0.0)
            continue

        act_scene = actual_scenes[i]
        exp_narration = exp_scene.get("narration", "").strip()
        act_narration = act_scene.get("narration", "").strip()

        if not exp_narration and not act_narration:
            scores.append(1.0)
            continue
        if not exp_narration and act_narration:
            # False positive: narration where there should be none
            scores.append(0.0)
            continue
        if exp_narration and not act_narration:
            # False negative: missing narration
            scores.append(0.0)
            continue

        scene_score = 0.0

        # Check word overlap (normalized)
        exp_words = set(exp_narration.lower().split())
        act_words = set(act_narration.lower().split())
        if exp_words:
            overlap = len(exp_words & act_words) / len(exp_words)
            scene_score += overlap * 0.6

        # Check for contamination: visual directions in narration
        contamination_patterns = [
            r"\b(wide shot|close[- ]up|medium shot|aerial|tracking shot)\b",
            r"\b(camera|lens|dolly|pan|zoom|crane)\b",
            r"\b(fade in|fade out|dissolve|cut to)\b",
            r"\b(SFX|sound effect|ambient)\b",
        ]
        contamination_count = 0
        for pattern in contamination_patterns:
            if re.search(pattern, act_narration, re.IGNORECASE):
                contamination_count += 1
        contamination_penalty = min(contamination_count * 0.1, 0.4)
        scene_score += max(0.0, 0.4 - contamination_penalty)

        scores.append(min(1.0, scene_score))

    return sum(scores) / len(scores) if scores else 0.0


def score_visual_quality(actual: dict, _expected: dict) -> float:
    """Score visual description quality: one subject, one moment, no banned words."""
    actual_scenes = actual.get("scenes", [])
    if not actual_scenes:
        return 0.0

    scores = []
    for scene in actual_scenes:
        vis = scene.get("visualDescription", "")
        if not vis:
            scores.append(0.0)
            continue

        scene_score = 1.0

        # Check for banned words
        vis_lower = vis.lower()
        for banned in BANNED_VISUAL_WORDS:
            if banned in vis_lower:
                scene_score -= 0.15
                break

        # Check for multi-subject indicators (", a ", "; ", multiple subjects)
        multi_subject_patterns = [
            r",\s+(?:a|an)\s+",   # ", a " — new subject introduction
            r";\s+",              # semicolons separating clauses
            r"\bthen\b",          # temporal sequence
            r"\bfollowed by\b",
        ]
        for pattern in multi_subject_patterns:
            if re.search(pattern, vis):
                scene_score -= 0.1

        # Check for temporal sequence (multi-moment)
        temporal_words = ["then", "next", "afterward", "later", "followed by",
                          "transitions to", "cuts to"]
        for word in temporal_words:
            if word in vis_lower:
                scene_score -= 0.15
                break

        # Length check: too short (<20 chars) or too long (>500 chars) is suspicious
        if len(vis) < 20:
            scene_score -= 0.2
        elif len(vis) > 500:
            scene_score -= 0.1

        scores.append(max(0.0, scene_score))

    return sum(scores) / len(scores) if scores else 0.0


def score_subshot_correctness(actual: dict, expected: dict) -> float:
    """Score sub-shot Mode A vs Mode B correctness."""
    actual_scenes = actual.get("scenes", [])
    expected_scenes = expected.get("expected_scenes", [])
    if not expected_scenes:
        return 1.0

    scores = []
    for i, exp_scene in enumerate(expected_scenes):
        if i >= len(actual_scenes):
            scores.append(0.0)
            continue

        act_scene = actual_scenes[i]
        exp_subshots = exp_scene.get("subShots", None)
        act_subshots = act_scene.get("subShots", None)

        # Both have no subshots = correct
        if not exp_subshots and not act_subshots:
            scores.append(1.0)
            continue

        # One has subshots, other doesn't
        if bool(exp_subshots) != bool(act_subshots):
            scores.append(0.3)  # Partial credit for getting scene right otherwise
            continue

        # Both have subshots — check count and independence mode
        if exp_subshots and act_subshots:
            count_score = 1.0 if len(act_subshots) == len(exp_subshots) else max(
                0.0, 1.0 - abs(len(act_subshots) - len(exp_subshots)) * 0.2
            )

            # Check Mode A vs Mode B
            exp_independent = any(s.get("independentGeneration", False) for s in exp_subshots)
            act_independent = any(s.get("independentGeneration", False) for s in act_subshots)
            mode_score = 1.0 if exp_independent == act_independent else 0.0

            scores.append(count_score * 0.5 + mode_score * 0.5)

    return sum(scores) / len(scores) if scores else 1.0


def score_onscreen_text(actual: dict, expected: dict) -> float:
    """Score on-screen text extraction: verbatim match against script."""
    actual_scenes = actual.get("scenes", [])
    expected_scenes = expected.get("expected_scenes", [])
    if not expected_scenes:
        return 1.0

    scores = []
    for i, exp_scene in enumerate(expected_scenes):
        if i >= len(actual_scenes):
            if exp_scene.get("editDirections", {}).get("onScreenText"):
                scores.append(0.0)
            continue

        act_scene = actual_scenes[i]
        exp_texts = exp_scene.get("editDirections", {}).get("onScreenText") or []
        act_dirs = act_scene.get("editDirections") or {}
        act_texts = act_dirs.get("onScreenText") or []

        if not exp_texts and not act_texts:
            scores.append(1.0)
            continue
        if not exp_texts and act_texts:
            scores.append(0.5)  # Hallucinated text, but may be from script
            continue
        if exp_texts and not act_texts:
            scores.append(0.0)  # Missed on-screen text
            continue

        # Check verbatim match
        matches = 0
        for exp_t in exp_texts:
            exp_normalized = exp_t.strip().lower()
            for act_t in act_texts:
                act_normalized = act_t.strip().lower()
                if exp_normalized == act_normalized:
                    matches += 1
                    break
                # Partial credit for close match (>80% char overlap)
                if len(exp_normalized) > 0:
                    common = sum(1 for a, b in zip(exp_normalized, act_normalized) if a == b)
                    ratio = common / max(len(exp_normalized), len(act_normalized))
                    if ratio > 0.8:
                        matches += 0.8
                        break

        precision = matches / len(act_texts) if act_texts else 0.0
        recall = matches / len(exp_texts) if exp_texts else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        scores.append(f1)

    return sum(scores) / len(scores) if scores else 1.0


def score_transition_mapping(actual: dict, expected: dict) -> float:
    """Score transition mapping accuracy: correct IDs from script cues."""
    actual_scenes = actual.get("scenes", [])
    expected_scenes = expected.get("expected_scenes", [])
    if not expected_scenes:
        return 1.0

    scores = []
    for i, exp_scene in enumerate(expected_scenes):
        if i >= len(actual_scenes):
            if exp_scene.get("editDirections", {}).get("transition"):
                scores.append(0.0)
            continue

        act_scene = actual_scenes[i]
        exp_transition = (exp_scene.get("editDirections") or {}).get("transition")
        act_dirs = act_scene.get("editDirections") or {}
        act_transition = act_dirs.get("transition")

        if not exp_transition and not act_transition:
            scores.append(1.0)
            continue
        if bool(exp_transition) != bool(act_transition):
            scores.append(0.0)
            continue

        if exp_transition and act_transition:
            exp_type = exp_transition.get("type", "")
            act_type = act_transition.get("type", "")

            # Check validity of actual transition ID
            if act_type not in VALID_TRANSITIONS:
                scores.append(0.0)
                continue

            # Exact match
            if exp_type == act_type:
                scores.append(1.0)
            # Partial credit: same family (e.g., both are cuts, both are dissolves)
            elif _same_transition_family(exp_type, act_type):
                scores.append(0.5)
            else:
                scores.append(0.0)

    return sum(scores) / len(scores) if scores else 1.0


def _same_transition_family(a: str, b: str) -> bool:
    """Check if two transitions belong to the same family."""
    families = {
        "cuts": {"hard-cut", "smash-cut", "match-cut", "jump-cut", "cut-on-action", "soft-cut"},
        "dissolves": {"dissolve", "dip-to-black", "dip-to-white", "blur-transition"},
        "wipes": {"wipe-left", "wipe-right", "slide-up", "slide-down", "iris-wipe"},
        "zooms": {"zoom-punch", "zoom-out"},
        "effects": {"flash", "glitch", "film-burn", "whip-pan"},
    }
    for family_members in families.values():
        if a in family_members and b in family_members:
            return True
    return False


def compute_composite_score(dimension_scores: dict[str, float]) -> float:
    """Compute weighted composite score from individual dimension scores."""
    total = 0.0
    weight_sum = 0.0
    for dim, weight in SCORE_WEIGHTS.items():
        if dim in dimension_scores:
            total += dimension_scores[dim] * weight
            weight_sum += weight
    return total / weight_sum if weight_sum > 0 else 0.0


# ─── Gemini API Call ─────────────────────────────────────────────

def call_gemini(prompt: str, seed: int, model_name: str = "gemini-2.5-flash") -> dict:
    """Call Gemini API and return parsed JSON response.

    NOTE: The deprecated google.generativeai SDK does NOT support the 'seed' parameter.
    The production code (Vercel AI SDK's generateObject) DOES support seed.
    For eval purposes, we rely on temperature=0.05 for near-determinism.
    Multi-seed testing here varies the seed parameter logged but the API call is identical.
    TODO: Migrate to google.genai (new SDK) which supports seed natively.
    """
    model = genai.GenerativeModel(model_name)
    generation_config = {
        "temperature": 0.05,
        "response_mime_type": "application/json",
    }

    response = model.generate_content(
        prompt,
        generation_config=generation_config,
    )

    try:
        result = json.loads(response.text)
    except json.JSONDecodeError as e:
        print(f"  [ERROR] Failed to parse JSON response: {e}", file=sys.stderr)
        print(f"  [ERROR] Raw response (first 500 chars): {response.text[:500]}", file=sys.stderr)
        return {"scenes": [], "_parse_error": str(e)}

    return result


# ─── Evaluation Runner ───────────────────────────────────────────

def load_test_cases() -> list[dict]:
    """Load all test scripts with their ground truth files."""
    test_cases = []
    for script_path in sorted(TEST_SCRIPTS_DIR.glob("*.txt")):
        gt_path = script_path.with_name(script_path.stem + "_ground_truth.json")
        if not gt_path.exists():
            print(f"  [SKIP] No ground truth for {script_path.name}")
            continue

        with open(gt_path, "r", encoding="utf-8") as f:
            ground_truth = json.load(f)

        if not ground_truth.get("expected_scenes"):
            print(f"  [SKIP] Empty ground truth for {script_path.name}")
            continue

        with open(script_path, "r", encoding="utf-8") as f:
            script_text = f.read()

        test_cases.append({
            "script_id": script_path.stem,
            "script_text": script_text,
            "script_path": str(script_path),
            "ground_truth": ground_truth,
        })

    return test_cases


def evaluate_single(script_text: str, ground_truth: dict, seed: int,
                     verbose: bool = False) -> dict[str, float]:
    """Run evaluation for a single script at a single seed."""
    prompt = build_scene_parser_prompt(
        script_text,
        art_style=ground_truth.get("art_style", ""),
        target_duration=ground_truth.get("target_duration", 0),
    )

    actual = call_gemini(prompt, seed=seed)

    if actual.get("_parse_error"):
        return {dim: 0.0 for dim in SCORE_WEIGHTS}

    scores = {
        "scene_count": score_scene_count(actual, ground_truth),
        "narration_quality": score_narration_quality(actual, ground_truth),
        "visual_quality": score_visual_quality(actual, ground_truth),
        "subshot_correctness": score_subshot_correctness(actual, ground_truth),
        "onscreen_text": score_onscreen_text(actual, ground_truth),
        "transition_mapping": score_transition_mapping(actual, ground_truth),
    }
    scores["composite"] = compute_composite_score(scores)

    if verbose:
        print(f"    Actual scene count: {len(actual.get('scenes', []))}")
        print(f"    Expected scene count: {len(ground_truth.get('expected_scenes', []))}")
        for dim, val in scores.items():
            print(f"    {dim}: {val:.3f}")

    return scores


def run_evaluation(seeds: list[int], verbose: bool = False) -> None:
    """Run full evaluation across all test cases and seeds."""
    test_cases = load_test_cases()
    if not test_cases:
        print("\n[ERROR] No test cases with ground truth found in test-scripts/")
        print("Run build_ground_truth.py first to create ground truth files.")
        sys.exit(1)

    print(f"\n{'='*72}")
    print(f"  Scene Parser Evaluation — {len(test_cases)} scripts, {len(seeds)} seeds")
    print(f"  Model: gemini-2.5-flash | Temperature: 0.05")
    print(f"{'='*72}\n")

    # Collect results: {script_id: {seed: {dim: score}}}
    all_results: dict[str, dict[int, dict[str, float]]] = {}

    for tc in test_cases:
        script_id = tc["script_id"]
        all_results[script_id] = {}
        print(f"[{script_id}]")

        for seed in seeds:
            print(f"  seed={seed} ...", end=" ", flush=True)
            t0 = time.time()
            scores = evaluate_single(
                tc["script_text"], tc["ground_truth"], seed=seed, verbose=verbose,
            )
            elapsed = time.time() - t0
            all_results[script_id][seed] = scores
            print(f"composite={scores.get('composite', 0):.3f} ({elapsed:.1f}s)")

        print()

    # ─── Summary Table ────────────────────────────────────────────
    print(f"\n{'='*72}")
    print("  SUMMARY — Per-script min/max/mean across seeds")
    print(f"{'='*72}\n")

    dimensions = list(SCORE_WEIGHTS.keys()) + ["composite"]
    header = f"{'Script':<30} " + " ".join(f"{'dim':>12}" for dim in dimensions)

    for script_id, seed_results in all_results.items():
        print(f"  {script_id}:")
        # Header
        print(f"    {'':>6} " + " ".join(f"{dim:>14}" for dim in dimensions))

        # Compute stats
        stats: dict[str, dict[str, float]] = {}
        for dim in dimensions:
            vals = [seed_results[s].get(dim, 0.0) for s in seeds]
            stats[dim] = {
                "min": min(vals),
                "max": max(vals),
                "mean": sum(vals) / len(vals),
            }

        for stat_name in ["min", "max", "mean"]:
            row = f"    {stat_name:>6} "
            row += " ".join(f"{stats[dim][stat_name]:>14.3f}" for dim in dimensions)
            print(row)
        print()

    # ─── Global Summary ───────────────────────────────────────────
    print(f"\n{'='*72}")
    print("  GLOBAL — Across all scripts and seeds")
    print(f"{'='*72}\n")

    global_scores: dict[str, list[float]] = {dim: [] for dim in dimensions}
    for seed_results in all_results.values():
        for scores in seed_results.values():
            for dim in dimensions:
                global_scores[dim].append(scores.get(dim, 0.0))

    print(f"    {'':>6} " + " ".join(f"{dim:>14}" for dim in dimensions))
    for stat_name, fn in [("min", min), ("max", max), ("mean", lambda x: sum(x)/len(x))]:
        row = f"    {stat_name:>6} "
        row += " ".join(f"{fn(global_scores[dim]):>14.3f}" for dim in dimensions)
        print(row)

    # ─── Pass/Fail Gate ───────────────────────────────────────────
    global_min_composite = min(global_scores["composite"])
    print(f"\n  Global min(composite) = {global_min_composite:.3f}")
    if global_min_composite >= 0.85:
        print("  RESULT: PASS (>= 0.85 threshold)")
    elif global_min_composite >= 0.70:
        print("  RESULT: MARGINAL (>= 0.70 but < 0.85)")
    else:
        print("  RESULT: FAIL (< 0.70)")


# ─── CLI ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scene Parser Evaluation Harness")
    parser.add_argument("--seed", type=int, help="Single seed to run")
    parser.add_argument("--seeds", type=str, help="Comma-separated seeds (e.g., 1,3,5,7)")
    parser.add_argument("--verbose", action="store_true", help="Show per-scene details")
    parser.add_argument("--model", type=str, default="gemini-2.5-flash",
                        help="Gemini model name (default: gemini-2.5-flash)")
    args = parser.parse_args()

    # Load .env
    for env_path in [SCRIPT_DIR / ".env", PROJECT_ROOT / ".env",
                     PROJECT_ROOT / ".env.local"]:
        if env_path.exists():
            load_dotenv(env_path)
            break

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("[ERROR] No API key found. Set GEMINI_API_KEY in .env file.", file=sys.stderr)
        sys.exit(1)

    genai.configure(api_key=api_key)

    # Determine seeds
    if args.seed is not None:
        seeds = [args.seed]
    elif args.seeds:
        seeds = [int(s.strip()) for s in args.seeds.split(",")]
    else:
        seeds = list(range(1, 11))  # Default: 1-10

    run_evaluation(seeds=seeds, verbose=args.verbose)


if __name__ == "__main__":
    main()
