#!/usr/bin/env python3
"""
Ground Truth Builder

Takes a script file, runs the scene parser on it, then walks the user through
interactive verification of each scene's fields. Saves verified output as
ground truth JSON for the evaluation harness.

Usage:
    python build_ground_truth.py test-scripts/mcdonalds_brand_ad.txt
    python build_ground_truth.py test-scripts/mcdonalds_brand_ad.txt --skip-parse
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

# Import the prompt builder from the eval harness
sys.path.insert(0, str(SCRIPT_DIR))
from eval_scene_parser import build_scene_parser_prompt, call_gemini


def load_existing_ground_truth(gt_path: Path) -> dict | None:
    """Load existing ground truth if present."""
    if gt_path.exists():
        with open(gt_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("expected_scenes"):
            return data
    return None


def prompt_user(question: str, default: str = "") -> str:
    """Prompt user for input with optional default."""
    suffix = f" [{default}]" if default else ""
    try:
        answer = input(f"  {question}{suffix}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\n[Aborted]")
        sys.exit(0)
    return answer if answer else default


def prompt_yes_no(question: str, default: bool = True) -> bool:
    """Prompt user for yes/no."""
    suffix = " [Y/n]" if default else " [y/N]"
    answer = prompt_user(question + suffix)
    if not answer:
        return default
    return answer.lower().startswith("y")


def verify_scene(scene: dict, index: int, script_text: str) -> dict:
    """Interactively verify/correct a single scene."""
    print(f"\n{'─'*60}")
    print(f"  Scene {index + 1}: {scene.get('title', '(no title)')}")
    print(f"{'─'*60}")

    fields_to_verify = [
        ("title", "Title"),
        ("narration", "Narration (VO text only)"),
        ("visualDescription", "Visual description"),
        ("musicDescription", "Music description"),
        ("sfxDescription", "SFX description"),
        ("durationSeconds", "Duration (seconds)"),
        ("mood", "Mood"),
        ("sceneType", "Scene type"),
    ]

    verified = dict(scene)  # shallow copy

    for field, label in fields_to_verify:
        current = scene.get(field, "")
        if isinstance(current, (int, float)):
            current_display = str(current)
        else:
            current_display = current if current else "(empty)"
            # Truncate long values for display
            if len(current_display) > 120:
                current_display = current_display[:117] + "..."

        print(f"\n  {label}:")
        print(f"    Current: {current_display}")

        if prompt_yes_no("Accept?", default=True):
            continue

        new_val = prompt_user(f"New value for {label}")
        if field == "durationSeconds":
            try:
                new_val = float(new_val)
            except ValueError:
                print(f"    [WARN] Invalid number, keeping {current}")
                continue
        verified[field] = new_val

    # Verify edit directions
    edit_dirs = scene.get("editDirections") or {}
    verified_dirs = dict(edit_dirs)

    # On-screen text
    ost = edit_dirs.get("onScreenText") or []
    if ost:
        print(f"\n  On-Screen Text: {ost}")
        if not prompt_yes_no("Accept on-screen text?", default=True):
            new_ost = prompt_user("New on-screen text (comma-separated, or empty)")
            verified_dirs["onScreenText"] = (
                [s.strip() for s in new_ost.split(",") if s.strip()] if new_ost else []
            )
    else:
        if not prompt_yes_no("No on-screen text — correct?", default=True):
            new_ost = prompt_user("Enter on-screen text (comma-separated)")
            verified_dirs["onScreenText"] = (
                [s.strip() for s in new_ost.split(",") if s.strip()] if new_ost else []
            )

    # Transition
    transition = edit_dirs.get("transition")
    if transition:
        t_type = transition.get("type", "")
        print(f"\n  Transition: {t_type} ({transition.get('durationMs', 0)}ms)")
        if not prompt_yes_no("Accept transition?", default=True):
            new_type = prompt_user("New transition type (or 'none')")
            if new_type and new_type != "none":
                verified_dirs["transition"] = {
                    "type": new_type,
                    "durationMs": int(prompt_user("Duration (ms)", "500")),
                }
            else:
                verified_dirs["transition"] = None

    verified["editDirections"] = verified_dirs

    # Sub-shots
    subshots = scene.get("subShots") or []
    if subshots:
        print(f"\n  Sub-shots: {len(subshots)}")
        for j, ss in enumerate(subshots):
            desc = ss.get("description", "")[:80]
            indep = ss.get("independentGeneration", False)
            print(f"    [{j}] {'[INDEP]' if indep else '[SHARED]'} {desc}")
        if not prompt_yes_no("Accept sub-shots?", default=True):
            # Simplified: accept or reject entirely
            if prompt_yes_no("Remove all sub-shots?", default=False):
                verified["subShots"] = []

    return verified


def build_ground_truth(script_path: Path, skip_parse: bool = False) -> None:
    """Main ground truth building flow."""
    if not script_path.exists():
        print(f"[ERROR] Script file not found: {script_path}", file=sys.stderr)
        sys.exit(1)

    with open(script_path, "r", encoding="utf-8") as f:
        script_text = f.read()

    gt_path = script_path.with_name(script_path.stem + "_ground_truth.json")
    script_id = script_path.stem

    print(f"\n{'='*60}")
    print(f"  Ground Truth Builder")
    print(f"  Script: {script_path.name}")
    print(f"  Output: {gt_path.name}")
    print(f"{'='*60}")

    # Check for existing ground truth
    existing = load_existing_ground_truth(gt_path)
    if existing:
        print(f"\n  Existing ground truth found ({len(existing.get('expected_scenes', []))} scenes)")
        if not prompt_yes_no("Re-build from scratch?", default=False):
            print("  Keeping existing ground truth.")
            return

    # Step 1: Get parser output
    if skip_parse:
        # Load from a previously saved raw output
        raw_path = script_path.with_name(script_path.stem + "_raw_output.json")
        if not raw_path.exists():
            print(f"[ERROR] --skip-parse requires {raw_path.name} to exist", file=sys.stderr)
            sys.exit(1)
        with open(raw_path, "r", encoding="utf-8") as f:
            parser_output = json.load(f)
    else:
        print("\n  Running scene parser (seed=1)...")
        prompt = build_scene_parser_prompt(script_text)
        parser_output = call_gemini(prompt, seed=1)

        if parser_output.get("_parse_error"):
            print(f"[ERROR] Parser failed: {parser_output['_parse_error']}", file=sys.stderr)
            sys.exit(1)

        # Save raw output for re-use
        raw_path = script_path.with_name(script_path.stem + "_raw_output.json")
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(parser_output, f, indent=2)
        print(f"  Raw output saved to {raw_path.name}")

    scenes = parser_output.get("scenes", [])
    print(f"\n  Parser returned {len(scenes)} scenes. Starting verification...\n")

    # Step 2: Walk through each scene
    verified_scenes = []
    for i, scene in enumerate(scenes):
        verified = verify_scene(scene, i, script_text)
        verified_scenes.append(verified)

    # Step 3: Verify global fields
    print(f"\n{'─'*60}")
    print(f"  Global Fields")
    print(f"{'─'*60}")

    overall_music = parser_output.get("overallMusicPrompt", "")
    print(f"\n  Overall Music: {overall_music[:100]}...")
    if not prompt_yes_no("Accept?", default=True):
        overall_music = prompt_user("New overall music prompt")

    profile_cat = parser_output.get("suggestedProfileCategory", "")
    print(f"\n  Suggested Profile Category: {profile_cat}")
    if not prompt_yes_no("Accept?", default=True):
        profile_cat = prompt_user(
            "New category (platform-native, industry-vertical, content-format, "
            "cinematic-style, narrative-mode, production-mode, special-purpose)"
        )

    # Step 4: Build and save ground truth
    ground_truth = {
        "script_id": script_id,
        "script_text": script_text,
        "expected_scenes": verified_scenes,
        "expected_global": {
            "overallMusicPrompt": overall_music,
            "characterDescriptions": parser_output.get("characterDescriptions", {}),
            "colorPalette": parser_output.get("colorPalette", []),
            "environmentNotes": parser_output.get("environmentNotes", ""),
            "suggestedProfileCategory": profile_cat,
            "globalEditDirections": parser_output.get("globalEditDirections"),
        },
        "target_duration": 0,  # Set manually if known
        "art_style": "",       # Set manually if known
    }

    with open(gt_path, "w", encoding="utf-8") as f:
        json.dump(ground_truth, f, indent=2, ensure_ascii=False)

    scene_count = len(verified_scenes)
    print(f"\n{'='*60}")
    print(f"  Ground truth saved: {gt_path.name}")
    print(f"  {scene_count} verified scenes")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Ground Truth Builder")
    parser.add_argument("script", type=str, help="Path to script .txt file")
    parser.add_argument("--skip-parse", action="store_true",
                        help="Skip parsing, use existing _raw_output.json")
    args = parser.parse_args()

    # Load .env
    for env_path in [SCRIPT_DIR / ".env", PROJECT_ROOT / ".env",
                     PROJECT_ROOT / ".env.local"]:
        if env_path.exists():
            load_dotenv(env_path)
            break

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key and not args.skip_parse:
        print("[ERROR] No API key found. Set GEMINI_API_KEY in .env file.", file=sys.stderr)
        sys.exit(1)

    if api_key:
        genai.configure(api_key=api_key)

    script_path = Path(args.script)
    if not script_path.is_absolute():
        script_path = SCRIPT_DIR / script_path

    build_ground_truth(script_path, skip_parse=args.skip_parse)


if __name__ == "__main__":
    main()
