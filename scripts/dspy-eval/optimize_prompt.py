#!/usr/bin/env python3
"""
DSPy MIPROv2 Prompt Optimizer for Scene Parser

Loads ground truth from test-scripts/, defines a DSPy program and metric,
runs MIPROv2 optimization, then extracts the optimized prompt text for
hardcoding into TypeScript.

Usage:
    python optimize_prompt.py
    python optimize_prompt.py --num-candidates=10 --max-bootstrapped=4
    python optimize_prompt.py --dry-run   # Test metric without optimization
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import dspy
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
TEST_SCRIPTS_DIR = SCRIPT_DIR / "test-scripts"
OPTIMIZED_DIR = SCRIPT_DIR / "optimized"

# Import scoring functions from eval harness
sys.path.insert(0, str(SCRIPT_DIR))
from eval_scene_parser import (
    SCORE_WEIGHTS,
    compute_composite_score,
    score_narration_quality,
    score_onscreen_text,
    score_scene_count,
    score_subshot_correctness,
    score_transition_mapping,
    score_visual_quality,
)


# ─── DSPy Signature ─────────────────────────────────────────────

class SceneParserSignature(dspy.Signature):
    """Parse a video production script into structured scenes for AI video generation.

    Each scene represents ONE AI video generation call. Extract narration (voiceover only),
    visual descriptions (one subject, one moment, no banned words), on-screen text (verbatim),
    transitions (mapped to valid IDs), and sub-shots (Mode A for same subject, Mode B for
    different subjects).

    Return a JSON object with: scenes array, overallMusicPrompt, characterDescriptions,
    colorPalette, environmentNotes, globalEditDirections, suggestedProfileCategory.
    """

    script_text: str = dspy.InputField(
        desc="The raw script text in any format (screenplay, voiceover, ThinkForge, timestamped, etc.)"
    )
    art_style: str = dspy.InputField(
        desc="Art style directive for visual descriptions",
        default="photorealistic cinematic with natural lighting",
    )
    target_scene_range: str = dspy.InputField(
        desc="Target number of scenes (e.g., '4-8')",
        default="4-8",
    )

    parsed_output: str = dspy.OutputField(
        desc=(
            "JSON object with: scenes (array of scene objects with title, narration, "
            "visualDescription, videoMotionPrompt, musicDescription, sfxDescription, "
            "durationSeconds, mood, sceneType, editDirections, subShots, etc.), "
            "overallMusicPrompt, characterDescriptions, colorPalette, environmentNotes, "
            "globalEditDirections, suggestedProfileCategory"
        )
    )


# ─── DSPy Module ─────────────────────────────────────────────────

class SceneParserModule(dspy.Module):
    """DSPy module wrapping the scene parser prompt."""

    def __init__(self):
        super().__init__()
        self.parser = dspy.ChainOfThought(SceneParserSignature)

    def forward(self, script_text: str, art_style: str = "",
                target_scene_range: str = "4-8") -> dspy.Prediction:
        result = self.parser(
            script_text=script_text,
            art_style=art_style or "photorealistic cinematic with natural lighting",
            target_scene_range=target_scene_range,
        )
        return result


# ─── Metric Function ────────────────────────────────────────────

def scene_parser_metric(example: dspy.Example, prediction: dspy.Prediction,
                         trace=None) -> float:
    """Score a prediction against ground truth using the 6-dimension scorer."""
    # Parse the prediction output
    try:
        raw_output = prediction.parsed_output
        if isinstance(raw_output, str):
            # Strip markdown code fences if present
            cleaned = raw_output.strip()
            if cleaned.startswith("```"):
                # Remove opening fence
                first_newline = cleaned.index("\n")
                cleaned = cleaned[first_newline + 1:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            actual = json.loads(cleaned.strip())
        else:
            actual = raw_output
    except (json.JSONDecodeError, ValueError, AttributeError) as e:
        # JSON parse failure = score 0
        if trace is not None:
            print(f"  [METRIC] JSON parse error: {e}")
        return 0.0

    # Build ground truth dict from example
    ground_truth = {
        "expected_scenes": example.expected_scenes,
    }

    # Compute dimension scores
    scores = {
        "scene_count": score_scene_count(actual, ground_truth),
        "narration_quality": score_narration_quality(actual, ground_truth),
        "visual_quality": score_visual_quality(actual, ground_truth),
        "subshot_correctness": score_subshot_correctness(actual, ground_truth),
        "onscreen_text": score_onscreen_text(actual, ground_truth),
        "transition_mapping": score_transition_mapping(actual, ground_truth),
    }

    composite = compute_composite_score(scores)

    if trace is not None:
        print(f"  [METRIC] Scores: {', '.join(f'{k}={v:.3f}' for k, v in scores.items())}")
        print(f"  [METRIC] Composite: {composite:.3f}")

    return composite


# ─── Data Loading ────────────────────────────────────────────────

def load_dspy_examples() -> list[dspy.Example]:
    """Load ground truth files as DSPy Examples."""
    examples = []

    for gt_path in sorted(TEST_SCRIPTS_DIR.glob("*_ground_truth.json")):
        with open(gt_path, "r", encoding="utf-8") as f:
            gt_data = json.load(f)

        if not gt_data.get("expected_scenes"):
            continue

        script_text = gt_data.get("script_text", "")
        if not script_text:
            # Try loading from companion .txt
            txt_path = gt_path.with_name(gt_path.stem.replace("_ground_truth", "") + ".txt")
            if txt_path.exists():
                with open(txt_path, "r", encoding="utf-8") as f:
                    script_text = f.read()

        if not script_text:
            print(f"  [SKIP] No script text for {gt_path.name}")
            continue

        example = dspy.Example(
            script_text=script_text,
            art_style=gt_data.get("art_style", ""),
            target_scene_range="4-8",
            expected_scenes=gt_data["expected_scenes"],
        ).with_inputs("script_text", "art_style", "target_scene_range")

        examples.append(example)

    return examples


# ─── Optimization ────────────────────────────────────────────────

def run_optimization(num_candidates: int = 7, max_bootstrapped: int = 3,
                      max_labeled: int = 4, num_threads: int = 1,
                      dry_run: bool = False) -> None:
    """Run MIPROv2 prompt optimization."""
    examples = load_dspy_examples()
    if not examples:
        print("\n[ERROR] No ground truth examples found. Run build_ground_truth.py first.")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  DSPy MIPROv2 Optimizer — Scene Parser")
    print(f"  Examples: {len(examples)}")
    print(f"  Candidates: {num_candidates}, Bootstrapped: {max_bootstrapped}")
    print(f"{'='*60}\n")

    # Split into train/dev if enough examples
    if len(examples) >= 4:
        split = max(2, len(examples) * 3 // 4)
        trainset = examples[:split]
        devset = examples[split:]
    else:
        trainset = examples
        devset = examples  # Use same for dev if too few

    print(f"  Train: {len(trainset)}, Dev: {len(devset)}")

    # Initialize the module
    program = SceneParserModule()

    if dry_run:
        # Test the metric on the first example
        print("\n  [DRY RUN] Testing metric on first example...")
        ex = trainset[0]
        pred = program(
            script_text=ex.script_text,
            art_style=ex.art_style,
            target_scene_range=ex.target_scene_range,
        )
        score = scene_parser_metric(ex, pred, trace=True)
        print(f"\n  [DRY RUN] Score: {score:.3f}")
        return

    # Run MIPROv2
    print("\n  Starting MIPROv2 optimization...\n")
    t0 = time.time()

    optimizer = dspy.MIPROv2(
        metric=scene_parser_metric,
        auto="light",  # Let DSPy auto-configure candidates + trials. Manual values conflict with auto.
    )

    optimized_program = optimizer.compile(
        program,
        trainset=trainset,
        requires_permission_to_run=False,
    )

    elapsed = time.time() - t0
    print(f"\n  Optimization complete in {elapsed:.1f}s")

    # Save optimized program
    OPTIMIZED_DIR.mkdir(exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    save_path = OPTIMIZED_DIR / f"scene_parser_{timestamp}.json"
    optimized_program.save(str(save_path), save_program=False)
    print(f"  Saved to: {save_path}")

    # Evaluate optimized program on dev set
    print(f"\n{'─'*60}")
    print(f"  Evaluating optimized program on dev set...")
    print(f"{'─'*60}\n")

    dev_scores = []
    for i, ex in enumerate(devset):
        pred = optimized_program(
            script_text=ex.script_text,
            art_style=ex.art_style,
            target_scene_range=ex.target_scene_range,
        )
        score = scene_parser_metric(ex, pred)
        dev_scores.append(score)
        print(f"  Dev example {i}: {score:.3f}")

    if dev_scores:
        mean_score = sum(dev_scores) / len(dev_scores)
        print(f"\n  Dev mean: {mean_score:.3f}")
        print(f"  Dev min:  {min(dev_scores):.3f}")
        print(f"  Dev max:  {max(dev_scores):.3f}")

    # Extract and print the optimized prompt
    print(f"\n{'='*60}")
    print(f"  OPTIMIZED PROMPT (for hardcoding into TypeScript)")
    print(f"{'='*60}\n")

    try:
        # DSPy stores the optimized prompt in the module's predictor
        predictor = optimized_program.parser
        if hasattr(predictor, "extended_signature"):
            sig = predictor.extended_signature
            print("  --- Signature Instructions ---")
            if hasattr(sig, "instructions"):
                print(sig.instructions)
            print("\n  --- Field Descriptions ---")
            for field_name, field_info in sig.output_fields.items():
                desc = getattr(field_info, "json_schema_extra", {})
                if desc:
                    print(f"  {field_name}: {desc}")

        if hasattr(predictor, "demos") and predictor.demos:
            print(f"\n  --- Bootstrapped Demos ({len(predictor.demos)}) ---")
            for j, demo in enumerate(predictor.demos):
                print(f"\n  Demo {j}:")
                demo_dict = demo.toDict() if hasattr(demo, "toDict") else dict(demo)
                # Print truncated version
                for key, val in demo_dict.items():
                    val_str = str(val)
                    if len(val_str) > 200:
                        val_str = val_str[:197] + "..."
                    print(f"    {key}: {val_str}")
    except Exception as e:
        print(f"  [WARN] Could not extract prompt details: {e}")
        print("  Check the saved program directory for full details.")

    # Save prompt text to file
    prompt_text_path = OPTIMIZED_DIR / f"scene_parser_{timestamp}_prompt.txt"
    try:
        with open(prompt_text_path, "w", encoding="utf-8") as f:
            f.write(f"# Optimized Scene Parser Prompt\n")
            f.write(f"# Generated: {timestamp}\n")
            f.write(f"# Dev mean score: {mean_score:.3f}\n\n")

            if hasattr(predictor, "extended_signature"):
                sig = predictor.extended_signature
                if hasattr(sig, "instructions"):
                    f.write(f"## Instructions\n{sig.instructions}\n\n")
                for field_name, field_info in sig.output_fields.items():
                    desc = getattr(field_info, "json_schema_extra", {})
                    if desc:
                        f.write(f"## {field_name}\n{desc}\n\n")

            if hasattr(predictor, "demos") and predictor.demos:
                f.write(f"\n## Demos ({len(predictor.demos)})\n")
                for j, demo in enumerate(predictor.demos):
                    f.write(f"\n### Demo {j}\n")
                    demo_dict = demo.toDict() if hasattr(demo, "toDict") else dict(demo)
                    f.write(json.dumps(demo_dict, indent=2, default=str)[:5000])
                    f.write("\n")

        print(f"\n  Prompt text saved to: {prompt_text_path}")
    except Exception as e:
        print(f"  [WARN] Could not save prompt text: {e}")


def main():
    parser = argparse.ArgumentParser(description="DSPy MIPROv2 Prompt Optimizer")
    parser.add_argument("--num-candidates", type=int, default=7,
                        help="Number of instruction candidates (default: 7)")
    parser.add_argument("--max-bootstrapped", type=int, default=3,
                        help="Max bootstrapped demos (default: 3)")
    parser.add_argument("--max-labeled", type=int, default=4,
                        help="Max labeled demos (default: 4)")
    parser.add_argument("--num-threads", type=int, default=1,
                        help="Number of threads (default: 1)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Test metric only, skip optimization")
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

    # Configure DSPy with Gemini
    # Using gemini-3.1-flash on paid tier — no rate limit concerns.
    # Cost: ~$0.25-0.50 for full optimization run.
    lm = dspy.LM(
        model="gemini/gemini-2.5-flash",
        api_key=api_key,
        temperature=0.05,
    )
    dspy.configure(lm=lm)

    run_optimization(
        num_candidates=args.num_candidates,
        max_bootstrapped=args.max_bootstrapped,
        max_labeled=args.max_labeled,
        num_threads=args.num_threads,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
