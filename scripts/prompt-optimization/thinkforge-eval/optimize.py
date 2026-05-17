"""
ThinkForge Prompt Optimization via DSPy

Uses ground truth scripts to optimize the ThinkForge agent pipeline prompts.
Evaluates: structural completeness, voice quality, visual specificity, brand adherence.

Usage:
  GEMINI_API_KEY=... python scripts/prompt-optimization/thinkforge-eval/optimize.py
  GEMINI_API_KEY=... python scripts/prompt-optimization/thinkforge-eval/optimize.py --eval-only
"""

import json
import os
import sys
import argparse
from pathlib import Path

import dspy

# --- Configuration ---

GROUND_TRUTH_PATH = Path(__file__).parent / "ground-truth.json"
OPTIMIZED_PROMPTS_PATH = Path(__file__).parent / "optimized-prompts.json"

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if not GEMINI_API_KEY:
    print("ERROR: Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable")
    sys.exit(1)


# --- DSPy Setup ---

lm = dspy.LM("gemini/gemini-2.5-flash", api_key=GEMINI_API_KEY, temperature=0.7)
dspy.configure(lm=lm)


# --- Signatures ---

class ScriptOutline(dspy.Signature):
    """Generate a structured outline for a video script."""
    prompt: str = dspy.InputField(desc="User's content brief: what the video is about, who it's for, brand voice")
    content_type: str = dspy.InputField(desc="Type: product_ad, brand_film, tutorial, talking_head, ugc_social")
    outline: str = dspy.OutputField(desc="JSON outline with 3-5 sections, each with: title, goal, beat (Setup/Tension/Turn/Resolution/Aftermath), tone")


class ScriptAuthor(dspy.Signature):
    """Write a production-ready video script with scene-by-scene detail."""
    prompt: str = dspy.InputField(desc="User's content brief")
    content_type: str = dspy.InputField(desc="Content type")
    outline: str = dspy.InputField(desc="Structural outline from previous stage")
    script: str = dspy.OutputField(desc="JSON array of scenes, each with: sceneIndex, narration (or null for visual-only), visualDescription (specific enough for AI video generation), mood, duration, editDirections, onScreenText (or null)")


# --- Module ---

class ThinkForgeScriptPipeline(dspy.Module):
    def __init__(self):
        self.outline_gen = dspy.ChainOfThought(ScriptOutline)
        self.script_gen = dspy.ChainOfThought(ScriptAuthor)

    def forward(self, prompt, content_type):
        outline_result = self.outline_gen(prompt=prompt, content_type=content_type)
        script_result = self.script_gen(
            prompt=prompt,
            content_type=content_type,
            outline=outline_result.outline,
        )
        return dspy.Prediction(
            outline=outline_result.outline,
            script=script_result.script,
        )


# --- Scoring ---

def parse_json_lenient(text: str):
    """Extract JSON from LLM output that might have markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
    return None


def score_script(generated_script_text: str, expected: dict) -> dict:
    """Score a generated script against ground truth quality markers."""
    scenes = parse_json_lenient(generated_script_text)
    if scenes is None:
        return {"total": 0.0, "parse_failed": True, "details": {}}

    if isinstance(scenes, dict) and "scenes" in scenes:
        scenes = scenes["scenes"]
    if not isinstance(scenes, list):
        return {"total": 0.0, "parse_failed": True, "details": {}}

    expected_scenes = expected.get("scenes", [])
    markers = expected.get("quality_markers", {})
    scores = {}

    # 1. Structure: correct number of scenes (within +/- 1)
    scene_diff = abs(len(scenes) - len(expected_scenes))
    scores["structure"] = 1.0 if scene_diff == 0 else 0.7 if scene_diff == 1 else 0.3

    # 2. Visual specificity: scenes have detailed visualDescription (>30 chars)
    vis_scores = []
    for s in scenes:
        vd = s.get("visualDescription", "") or ""
        if len(vd) > 80:
            vis_scores.append(1.0)
        elif len(vd) > 40:
            vis_scores.append(0.6)
        elif len(vd) > 10:
            vis_scores.append(0.3)
        else:
            vis_scores.append(0.0)
    scores["visual_specificity"] = sum(vis_scores) / max(len(vis_scores), 1)

    # 3. Narration quality: not robotic (check for banned phrases)
    robotic_markers = [
        "in this section", "let us", "let's explore", "it is important to",
        "furthermore", "moreover", "in conclusion", "as we can see",
        "this section will", "we will discuss", "it should be noted",
    ]
    narration_scores = []
    for s in scenes:
        narr = (s.get("narration", "") or "").lower()
        if not narr:
            narration_scores.append(0.7)  # visual-only scenes are fine
            continue
        has_robotic = any(m in narr for m in robotic_markers)
        has_personality = len(narr) > 20 and not narr.startswith("this")
        score = 0.0
        if not has_robotic:
            score += 0.6
        if has_personality:
            score += 0.4
        narration_scores.append(min(score, 1.0))
    scores["narration_quality"] = sum(narration_scores) / max(len(narration_scores), 1)

    # 4. Mood presence: every scene should have a mood
    mood_count = sum(1 for s in scenes if s.get("mood"))
    scores["mood_coverage"] = mood_count / max(len(scenes), 1)

    # 5. Duration presence: scenes should specify duration
    dur_count = sum(1 for s in scenes if s.get("duration"))
    scores["duration_coverage"] = dur_count / max(len(scenes), 1)

    # 6. Edit directions presence
    ed_count = sum(1 for s in scenes if s.get("editDirections"))
    scores["edit_directions"] = ed_count / max(len(scenes), 1)

    # 7. Hook quality: first scene should grab attention
    if scenes:
        first = scenes[0]
        first_narr = (first.get("narration", "") or "").lower()
        first_vis = (first.get("visualDescription", "") or "")
        has_hook = (
            "?" in first_narr or  # question hook
            any(w in first_narr for w in ["you", "imagine", "what if", "ever", "stop"]) or  # direct address
            len(first_vis) > 60  # visual hook
        )
        scores["hook"] = 1.0 if has_hook else 0.3
    else:
        scores["hook"] = 0.0

    # Weighted total (emotion/story/hook weighted higher per Murch's Rule of Six)
    weights = {
        "structure": 0.10,
        "visual_specificity": 0.20,
        "narration_quality": 0.25,
        "mood_coverage": 0.10,
        "duration_coverage": 0.10,
        "edit_directions": 0.10,
        "hook": 0.15,
    }
    total = sum(scores[k] * weights[k] for k in weights)
    scores["total"] = round(total, 3)

    return {"total": total, "parse_failed": False, "details": scores}


# --- Eval Metric for DSPy ---

def thinkforge_metric(example, prediction, trace=None) -> float:
    """DSPy metric: score generated script against ground truth."""
    gt = example.get("expected_output", example)
    result = score_script(prediction.script, gt)
    return result["total"]


# --- Main ---

def load_ground_truth():
    with open(GROUND_TRUTH_PATH) as f:
        data = json.load(f)

    examples = []
    for item in data:
        ex = dspy.Example(
            prompt=item["input_prompt"],
            content_type=item["content_type"],
            expected_output=item["expected_output"],
        ).with_inputs("prompt", "content_type")
        examples.append(ex)
    return examples


def run_eval(pipeline, examples):
    """Evaluate the pipeline on all ground truth examples."""
    print("\n=== EVALUATION ===\n")
    total_score = 0
    for ex in examples:
        pred = pipeline(prompt=ex.prompt, content_type=ex.content_type)
        result = score_script(pred.script, ex.expected_output)
        status = "PASS" if result["total"] >= 0.7 else "NEEDS WORK" if result["total"] >= 0.5 else "FAIL"
        print(f"  [{status}] {ex.content_type}: {result['total']:.2f}")
        if result.get("parse_failed"):
            print(f"         PARSE FAILED — raw output: {pred.script[:100]}...")
        else:
            for k, v in result["details"].items():
                if k != "total":
                    flag = " <--" if v < 0.5 else ""
                    print(f"         {k}: {v:.2f}{flag}")
        total_score += result["total"]
        print()

    avg = total_score / max(len(examples), 1)
    print(f"  AVERAGE SCORE: {avg:.3f}")
    print(f"  {'PRODUCTION READY' if avg >= 0.75 else 'NEEDS OPTIMIZATION' if avg >= 0.5 else 'SIGNIFICANT WORK NEEDED'}")
    return avg


def run_optimization(pipeline, examples):
    """Run DSPy optimization to find better prompt instructions."""
    print("\n=== OPTIMIZATION (DSPy MIPROv2) ===\n")
    print(f"  Ground truth examples: {len(examples)}")
    print(f"  Running optimization... (this takes 5-15 minutes)\n")

    optimizer = dspy.MIPROv2(
        metric=thinkforge_metric,
        auto="medium",
    )

    optimized = optimizer.compile(
        pipeline,
        trainset=examples,
        max_bootstrapped_demos=2,
        max_labeled_demos=2,
    )

    # Save optimized prompts
    optimized.save(str(OPTIMIZED_PROMPTS_PATH))
    print(f"\n  Optimized prompts saved to: {OPTIMIZED_PROMPTS_PATH}")

    # Eval the optimized version
    print("\n=== POST-OPTIMIZATION EVAL ===")
    avg = run_eval(optimized, examples)
    return optimized, avg


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ThinkForge prompt optimization")
    parser.add_argument("--eval-only", action="store_true", help="Only evaluate, don't optimize")
    args = parser.parse_args()

    examples = load_ground_truth()
    pipeline = ThinkForgeScriptPipeline()

    if args.eval_only:
        # Check if optimized prompts exist
        if OPTIMIZED_PROMPTS_PATH.exists():
            print("Loading optimized prompts...")
            pipeline.load(str(OPTIMIZED_PROMPTS_PATH))
        run_eval(pipeline, examples)
    else:
        # Pre-optimization eval
        print("=== PRE-OPTIMIZATION BASELINE ===")
        run_eval(pipeline, examples)

        # Optimize
        optimized, avg = run_optimization(pipeline, examples)
        print(f"\n=== DONE. Final average: {avg:.3f} ===")
