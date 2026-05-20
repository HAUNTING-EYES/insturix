#!/usr/bin/env python3
"""
Generic Prompt Evaluation Harness

Template for evaluating ANY LLM prompt, not just the scene parser.
Provide a prompt template, test data, and scoring function — runs
multi-seed evaluation with min/max/mean reporting.

Usage:
    python eval_generic.py \\
        --prompt-template=prompts/my_prompt.txt \\
        --test-data=test-data/my_tests.json \\
        --scoring-module=scoring_functions.my_scorer \\
        --seeds=1,2,3,4,5

Test data JSON format:
    [
        {
            "id": "test_1",
            "input": {"key": "value", ...},
            "expected": {"key": "value", ...}
        },
        ...
    ]

Prompt template format:
    Use {variable_name} placeholders that map to keys in test data "input".
    Example: "Parse this script: {script_text}"

Scoring module:
    A Python module with a `score(actual: dict, expected: dict) -> float` function.
    The function receives the parsed JSON output and the expected dict, returns 0.0-1.0.
    If not provided, uses a default JSON key-match scorer.
"""

import argparse
import importlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Callable

import google.generativeai as genai
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent


# ─── Default Scorer ──────────────────────────────────────────────

def default_json_scorer(actual: dict, expected: dict) -> float:
    """Default scorer: checks key presence and value match in JSON output."""
    if not expected:
        return 1.0 if actual else 0.0
    if not actual:
        return 0.0

    total_keys = 0
    matched_keys = 0

    for key, exp_val in expected.items():
        total_keys += 1
        act_val = actual.get(key)

        if act_val is None:
            continue

        if isinstance(exp_val, str) and isinstance(act_val, str):
            # Normalized string comparison
            if exp_val.strip().lower() == act_val.strip().lower():
                matched_keys += 1
            else:
                # Partial credit for substring match
                if exp_val.lower() in act_val.lower() or act_val.lower() in exp_val.lower():
                    matched_keys += 0.5
        elif isinstance(exp_val, (int, float)) and isinstance(act_val, (int, float)):
            # Numeric: full credit within 10%, partial within 25%
            if exp_val == 0:
                matched_keys += 1.0 if act_val == 0 else 0.0
            else:
                ratio = abs(act_val - exp_val) / abs(exp_val)
                if ratio <= 0.1:
                    matched_keys += 1.0
                elif ratio <= 0.25:
                    matched_keys += 0.5
        elif isinstance(exp_val, list) and isinstance(act_val, list):
            # List: check overlap
            if not exp_val:
                matched_keys += 1.0 if not act_val else 0.5
            else:
                exp_set = set(str(v).lower() for v in exp_val)
                act_set = set(str(v).lower() for v in act_val)
                overlap = len(exp_set & act_set) / len(exp_set)
                matched_keys += overlap
        elif isinstance(exp_val, dict) and isinstance(act_val, dict):
            # Recursive dict comparison
            sub_score = default_json_scorer(act_val, exp_val)
            matched_keys += sub_score
        elif exp_val == act_val:
            matched_keys += 1.0

    return matched_keys / total_keys if total_keys > 0 else 0.0


# ─── Gemini API ──────────────────────────────────────────────────

def call_gemini_generic(prompt: str, seed: int,
                         model_name: str = "gemini-2.5-flash",
                         response_format: str = "application/json") -> dict:
    """Call Gemini API with a prompt and return parsed response."""
    model = genai.GenerativeModel(model_name)
    config = genai.types.GenerationConfig(
        temperature=0.05,
        seed=seed,
    )
    if response_format == "application/json":
        config = genai.types.GenerationConfig(
            temperature=0.05,
            response_mime_type="application/json",
            seed=seed,
        )

    response = model.generate_content(prompt, generation_config=config)

    try:
        if response_format == "application/json":
            return json.loads(response.text)
        else:
            return {"raw_text": response.text}
    except json.JSONDecodeError as e:
        print(f"  [ERROR] JSON parse failure: {e}", file=sys.stderr)
        return {"_parse_error": str(e), "raw_text": response.text[:1000]}


# ─── Template Rendering ─────────────────────────────────────────

def render_prompt(template: str, variables: dict) -> str:
    """Render a prompt template with variables. Uses {key} placeholders."""
    result = template
    for key, value in variables.items():
        placeholder = "{" + key + "}"
        if placeholder in result:
            result = result.replace(placeholder, str(value))
    return result


# ─── Evaluation Runner ───────────────────────────────────────────

def run_generic_eval(prompt_template: str, test_data: list[dict],
                      scorer: Callable, seeds: list[int],
                      model_name: str = "gemini-2.5-flash",
                      verbose: bool = False) -> None:
    """Run evaluation across all test cases and seeds."""
    print(f"\n{'='*72}")
    print(f"  Generic Prompt Evaluation")
    print(f"  Test cases: {len(test_data)}, Seeds: {len(seeds)}")
    print(f"  Model: {model_name} | Temperature: 0.05")
    print(f"{'='*72}\n")

    # Results: {test_id: {seed: score}}
    all_results: dict[str, dict[int, float]] = {}

    for tc in test_data:
        test_id = tc.get("id", "unknown")
        inputs = tc.get("input", {})
        expected = tc.get("expected", {})

        all_results[test_id] = {}
        print(f"[{test_id}]")

        for seed in seeds:
            print(f"  seed={seed} ...", end=" ", flush=True)
            t0 = time.time()

            prompt = render_prompt(prompt_template, inputs)
            actual = call_gemini_generic(prompt, seed=seed, model_name=model_name)

            if actual.get("_parse_error"):
                score = 0.0
            else:
                score = scorer(actual, expected)

            elapsed = time.time() - t0
            all_results[test_id][seed] = score
            print(f"score={score:.3f} ({elapsed:.1f}s)")

            if verbose and actual.get("_parse_error"):
                print(f"    Parse error: {actual['_parse_error']}")

        print()

    # ─── Summary ──────────────────────────────────────────────────
    print(f"\n{'='*72}")
    print(f"  SUMMARY")
    print(f"{'='*72}\n")

    print(f"  {'Test ID':<30} {'Min':>8} {'Max':>8} {'Mean':>8}")
    print(f"  {'─'*54}")

    global_scores = []
    for test_id, seed_scores in all_results.items():
        vals = list(seed_scores.values())
        global_scores.extend(vals)
        print(f"  {test_id:<30} {min(vals):>8.3f} {max(vals):>8.3f} "
              f"{sum(vals)/len(vals):>8.3f}")

    if global_scores:
        print(f"  {'─'*54}")
        print(f"  {'GLOBAL':<30} {min(global_scores):>8.3f} "
              f"{max(global_scores):>8.3f} "
              f"{sum(global_scores)/len(global_scores):>8.3f}")

        min_score = min(global_scores)
        print(f"\n  Global min = {min_score:.3f}")
        if min_score >= 0.85:
            print("  RESULT: PASS")
        elif min_score >= 0.70:
            print("  RESULT: MARGINAL")
        else:
            print("  RESULT: FAIL")


# ─── CLI ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generic Prompt Evaluation Harness")
    parser.add_argument("--prompt-template", type=str, required=True,
                        help="Path to prompt template file (.txt)")
    parser.add_argument("--test-data", type=str, required=True,
                        help="Path to test data JSON file")
    parser.add_argument("--scoring-module", type=str, default="",
                        help="Python module path with score(actual, expected) function")
    parser.add_argument("--seeds", type=str, default="1,2,3,4,5",
                        help="Comma-separated seeds (default: 1,2,3,4,5)")
    parser.add_argument("--model", type=str, default="gemini-2.5-flash",
                        help="Gemini model name")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    # Load .env
    for env_path in [SCRIPT_DIR / ".env", PROJECT_ROOT / ".env",
                     PROJECT_ROOT / ".env.local"]:
        if env_path.exists():
            load_dotenv(env_path)
            break

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("[ERROR] No API key found. Set GEMINI_API_KEY in .env", file=sys.stderr)
        sys.exit(1)

    genai.configure(api_key=api_key)

    # Load prompt template
    template_path = Path(args.prompt_template)
    if not template_path.exists():
        print(f"[ERROR] Prompt template not found: {template_path}", file=sys.stderr)
        sys.exit(1)
    with open(template_path, "r", encoding="utf-8") as f:
        prompt_template = f.read()

    # Load test data
    data_path = Path(args.test_data)
    if not data_path.exists():
        print(f"[ERROR] Test data not found: {data_path}", file=sys.stderr)
        sys.exit(1)
    with open(data_path, "r", encoding="utf-8") as f:
        test_data = json.load(f)

    if not isinstance(test_data, list):
        print("[ERROR] Test data must be a JSON array", file=sys.stderr)
        sys.exit(1)

    # Load scorer
    scorer = default_json_scorer
    if args.scoring_module:
        try:
            parts = args.scoring_module.rsplit(".", 1)
            if len(parts) == 2:
                mod = importlib.import_module(parts[0])
                scorer = getattr(mod, parts[1])
            else:
                mod = importlib.import_module(parts[0])
                scorer = getattr(mod, "score")
        except (ImportError, AttributeError) as e:
            print(f"[ERROR] Could not load scorer '{args.scoring_module}': {e}",
                  file=sys.stderr)
            sys.exit(1)

    seeds = [int(s.strip()) for s in args.seeds.split(",")]

    run_generic_eval(
        prompt_template=prompt_template,
        test_data=test_data,
        scorer=scorer,
        seeds=seeds,
        model_name=args.model,
        verbose=args.verbose,
    )


if __name__ == "__main__":
    main()
