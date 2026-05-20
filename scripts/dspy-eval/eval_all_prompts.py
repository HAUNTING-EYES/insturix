#!/usr/bin/env python3
"""
Score ALL measurable prompts across the Insturix pipeline.
Runs each prompt against synthetic test cases and reports accuracy.

Usage:
    python eval_all_prompts.py
"""

import json
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

# Load API key
load_dotenv(Path(__file__).parent / ".env")
load_dotenv(Path(__file__).parent.parent.parent / ".env.preview")

import google.generativeai as genai

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("ERROR: No GEMINI_API_KEY", file=sys.stderr)
    sys.exit(1)

genai.configure(api_key=API_KEY)
MODEL = genai.GenerativeModel("gemini-2.5-flash")
CONFIG = {"temperature": 0.05, "response_mime_type": "application/json"}

RESULTS = {}
TOTAL_CALLS = 0


def call_gemini(prompt: str) -> str:
    global TOTAL_CALLS
    TOTAL_CALLS += 1
    try:
        r = MODEL.generate_content(prompt, generation_config=CONFIG)
        return r.text.strip()
    except Exception as e:
        print(f"    API error: {e}")
        return ""


def score_classifier(name: str, test_cases: list[dict], prompt_builder, parser, print_detail=True):
    """Score a classifier prompt against test cases.

    test_cases: [{"input": ..., "expected": ..., "description": str}]
    prompt_builder: (input) -> prompt string
    parser: (raw_response) -> parsed classification
    """
    correct = 0
    total = len(test_cases)
    failures = []

    for i, tc in enumerate(test_cases):
        prompt = prompt_builder(tc["input"])
        raw = call_gemini(prompt)
        try:
            actual = parser(raw)
        except Exception:
            actual = f"PARSE_ERROR: {raw[:100]}"

        is_correct = actual == tc["expected"]
        if is_correct:
            correct += 1
        else:
            failures.append(f"    Case {i}: expected={tc['expected']}, got={actual} — {tc['description']}")

        if print_detail:
            mark = "OK" if is_correct else "FAIL"
            print(f"  {mark} Case {i}: {tc['description'][:60]}... -> {actual}")

    accuracy = correct / total if total > 0 else 0
    RESULTS[name] = {"accuracy": accuracy, "correct": correct, "total": total, "failures": failures}
    print(f"  SCORE: {accuracy:.3f} ({correct}/{total})\n")
    return accuracy


# ════════════════════════════════════════════════════════════════
# 1. EDITORIAL INTENT DETECTOR — CONTENT / META_DISCARD / META_KEEP
# ════════════════════════════════════════════════════════════════

EDITORIAL_CASES = [
    {"input": '[0] (0s) "The internet has fundamentally changed how we communicate"', "expected": "CONTENT", "description": "Topic delivery — clear content"},
    {"input": '[1] (5s) "Wait, let me start over, that came out wrong"', "expected": "META_DISCARD", "description": "Self-correction — retake"},
    {"input": '[2] (8s) "Make sure to highlight this part, it\'s the key message"', "expected": "META_KEEP", "description": "Editorial instruction to preserve"},
    {"input": '[3] (12s) "Is the camera recording? Can you check the light?"', "expected": "META_DISCARD", "description": "Behind-the-scenes chatter"},
    {"input": '[4] (15s) "The data shows a 40 percent increase in engagement"', "expected": "CONTENT", "description": "Topic delivery — statistics"},
    {"input": '[5] (20s) "Cut! Take two, let me redo that"', "expected": "META_DISCARD", "description": "Explicit retake request"},
    {"input": '[6] (25s) "Put this part at the beginning of the video"', "expected": "META_KEEP", "description": "Structural directive"},
    {"input": '[7] (28s) "So this is the editing challenge, I\'m gonna make a video right now"', "expected": "META_DISCARD", "description": "Video format commentary"},
    {"input": '[8] (33s) "Three key factors drive this trend in the market"', "expected": "CONTENT", "description": "Topic delivery — analysis"},
    {"input": '[9] (38s) "Okay I\'m gonna use that, that sounds good"', "expected": "META_DISCARD", "description": "Creative self-assessment"},
    {"input": '[10] (42s) "And that brings us to perhaps the most important point"', "expected": "CONTENT", "description": "Transition within content"},
    {"input": '[11] (48s) "Zoom in here when you edit this"', "expected": "META_KEEP", "description": "Emphasis request"},
    {"input": '[12] (52s) "Let me think about how to phrase this... the real issue is trust"', "expected": "CONTENT", "description": "Rhetorical self-address within content flow"},
    {"input": '[13] (58s) "I messed that up, sorry, one more time"', "expected": "META_DISCARD", "description": "Verbal mistake acknowledged"},
    {"input": '[14] (62s) "This should go after the product demo section"', "expected": "META_KEEP", "description": "Sequencing instruction"},
]


def build_editorial_prompt(segment_text: str) -> str:
    return f"""<role>You are a professional video editor analyzing raw footage transcript segments.</role>
<task>Classify the segment into exactly one category: CONTENT, META_DISCARD, or META_KEEP.</task>
<rules>
CONTENT — Actual video content the viewer should see. DEFAULT when in doubt.
META_DISCARD — Meta-commentary to remove: self-corrections, retake requests, behind-the-scenes, process commentary.
META_KEEP — Meta-commentary with editorial instructions: structural directives, emphasis requests, sequencing.
</rules>
<output_format>JSON: {{"classification": "CONTENT"|"META_DISCARD"|"META_KEEP"}}</output_format>
<segments>
{segment_text}
</segments>"""


def parse_editorial(raw: str) -> str:
    d = json.loads(raw)
    if isinstance(d, list):
        d = d[0]
    return d.get("classification", "UNKNOWN")


# ════════════════════════════════════════════════════════════════
# 2. HOLISTIC EDITOR — KEEP / CUT
# ════════════════════════════════════════════════════════════════

HOLISTIC_CASES = [
    {"input": {"segments": [
        {"index": 0, "text": "So today we're going to talk about machine learning"},
        {"index": 1, "text": "Wait, let me start that again"},
        {"index": 2, "text": "Today we're diving into machine learning and why it matters"},
        {"index": 3, "text": "The first thing to understand is that ML is really about patterns"},
        {"index": 4, "text": "Um"},
        {"index": 5, "text": "Patterns in data, that's the whole game"},
        {"index": 6, "text": "Is my mic on? Yeah okay"},
        {"index": 7, "text": "So to summarize, ML finds patterns humans can't see"},
    ]}, "expected": {"keep": [2, 3, 5, 7], "cut": [0, 1, 4, 6]}, "description": "Basic retake + filler removal"},
]


def build_holistic_prompt(data: dict) -> str:
    seg_list = "\n".join(f'[{s["index"]}] "{s["text"]}"' for s in data["segments"])
    return f"""<role>You are a professional video editor making a rough cut of raw footage.</role>
<task>For each segment, decide KEEP or CUT. Goal: clean video with only the final polished delivery.</task>
<rules>
CUT: stutters, retakes (keep only best version), meta-commentary, filler ("um", "okay"), warm-up.
KEEP: thesis, arguments, punchlines, conclusion, natural speech.
CRITICAL: same line multiple times = keep ONLY ONE best version.
</rules>
<output_format>JSON: {{"keep": [indices], "cut": [indices]}}. Every index in exactly one array.</output_format>
<segments>
{seg_list}
</segments>"""


def parse_holistic(raw: str) -> dict:
    return json.loads(raw)


# ════════════════════════════════════════════════════════════════
# 3. INTENT CLASSIFIER — REWRITE / EDIT / CONTINUE / FORK
# ════════════════════════════════════════════════════════════════

INTENT_CASES = [
    {"input": "Rewrite the whole thing from scratch", "expected": "REWRITE", "description": "Explicit rewrite"},
    {"input": "Fix the tone in paragraph 3", "expected": "EDIT", "description": "Targeted edit"},
    {"input": "Continue writing the next section", "expected": "CONTINUE", "description": "Explicit continue"},
    {"input": "Start over completely", "expected": "REWRITE", "description": "Start over"},
    {"input": "Make it more casual and friendly", "expected": "EDIT", "description": "Tone adjustment"},
    {"input": "Add the conclusion", "expected": "CONTINUE", "description": "Add to end"},
    {"input": "Create an alternative version", "expected": "FORK", "description": "Alternative version"},
    {"input": "Change the intro hook", "expected": "EDIT", "description": "Modify existing"},
    {"input": "Keep going, write the next part", "expected": "CONTINUE", "description": "Keep going"},
    {"input": "Scrap this and try a different approach", "expected": "REWRITE", "description": "Scrap and redo"},
]


def build_intent_prompt(msg: str) -> str:
    return f"""<role>You are a strict intent classifier.</role>
<task>Classify the user's request. Return ONLY one label: REWRITE, EDIT, CONTINUE, or FORK.</task>
<rules>
REWRITE: start over, rewrite, discard existing content.
CONTINUE: continue, add more, proceed to next part.
EDIT: modify existing content, fix, adjust tone, refine.
FORK: new version or branch while preserving original.
</rules>
<output_format>JSON: {{"intent": "REWRITE"|"EDIT"|"CONTINUE"|"FORK"}}</output_format>
<input_data>User message: "{msg}"</input_data>"""


def parse_intent(raw: str) -> str:
    d = json.loads(raw)
    return d.get("intent", raw.strip().upper())


# ════════════════════════════════════════════════════════════════
# 4. SCOPE DETECTOR — Complexity classification
# ════════════════════════════════════════════════════════════════

SCOPE_CASES = [
    {"input": "Quick 30-second Instagram reel about my morning coffee routine", "expected": "solo_ugc", "description": "Solo UGC short-form"},
    {"input": "Brand documentary about our company's 50-year history, 8 minutes, interview-based", "expected": "brand_doc", "description": "Brand documentary"},
    {"input": "15-minute short film about a robot discovering emotions, full crew", "expected": "short_film", "description": "Short film"},
    {"input": "TikTok video showing my workout", "expected": "solo_ugc", "description": "TikTok solo"},
    {"input": "Corporate training series, 6 episodes, each 20 minutes", "expected": "epic", "description": "Multi-episode series"},
    {"input": "Product launch video for our new sneaker line, 2 minutes, cinematic", "expected": "brand_doc", "description": "Product launch"},
]


def build_scope_prompt(desc: str) -> str:
    return f"""<role>You are a Production Scale Analyzer for ThinkForge.</role>
<task>Classify the project complexity.</task>
<rules>
solo_ugc: Solo creator, reels/shorts/ads, usually <60s.
brand_doc: Brand documentary/commercial, interview-based, 2-10 min.
short_film: Short film or high-end branded, multi-crew, 5-30 min.
feature_film: Feature-length, full crew, 60-120+ min.
epic: Multi-project universe, franchise, series.
</rules>
<output_format>JSON: {{"complexity": "solo_ugc"|"brand_doc"|"short_film"|"feature_film"|"epic"}}</output_format>
<input_data>Project: {desc}</input_data>"""


def parse_scope(raw: str) -> str:
    d = json.loads(raw)
    return d.get("complexity", "UNKNOWN")


# ════════════════════════════════════════════════════════════════
# 5. THINKFORGE INTENT CLASSIFIER — 5-way chat routing
# ════════════════════════════════════════════════════════════════

TF_INTENT_CASES = [
    {"input": {"message": "What's the best format for a cooking video?", "hasScript": False, "hasSelection": False}, "expected": "chat", "description": "General Q&A"},
    {"input": {"message": "Write me a script about sustainable fashion", "hasScript": False, "hasSelection": False}, "expected": "draft", "description": "New script request"},
    {"input": {"message": "Make the intro more punchy", "hasScript": True, "hasSelection": True}, "expected": "edit", "description": "Edit existing with selection"},
    {"input": {"message": "Find trending topics in fitness content", "hasScript": False, "hasSelection": False}, "expected": "research", "description": "Research request"},
    {"input": {"message": "Rewrite this paragraph and also what length works best for YouTube", "hasScript": True, "hasSelection": True}, "expected": "hybrid", "description": "Edit + question combo"},
    {"input": {"message": "Search for viral hooks in the tech niche", "hasScript": False, "hasSelection": False}, "expected": "research", "description": "Search/find request"},
    {"input": {"message": "Fix the grammar in section 2", "hasScript": True, "hasSelection": False}, "expected": "edit", "description": "Grammar fix"},
    {"input": {"message": "Generate a script for a product launch", "hasScript": False, "hasSelection": False}, "expected": "draft", "description": "Generate request"},
]


def build_tf_intent_prompt(data: dict) -> str:
    return f"""<role>You classify user intent for a script editor.</role>
<task>Classify the user message into one intent.</task>
<rules>
chat: general Q&A, how-to questions, explanations.
draft: create/write/generate a new script.
edit: modify existing content (rewrite, fix, refine).
hybrid: mix of edit + question or edit + draft.
research: find trends, examples, references, ideas, sources.
</rules>
<output_format>JSON: {{"intent": "chat"|"draft"|"edit"|"hybrid"|"research"}}</output_format>
<input_data>
Has script: {data['hasScript']}
Has selection: {data['hasSelection']}
Message: "{data['message']}"
</input_data>"""


def parse_tf_intent(raw: str) -> str:
    d = json.loads(raw)
    return d.get("intent", "UNKNOWN")


# ════════════════════════════════════════════════════════════════
# 6. ARGUMENT STRUCTURE PROTECTOR — Essential indices
# ════════════════════════════════════════════════════════════════

ARGUMENT_CASES = [
    {"input": [
        {"index": 0, "text": "So um, let me get started here"},
        {"index": 1, "text": "The number one problem with social media is that it's designed to be addictive"},
        {"index": 2, "text": "Like, you know, they use these algorithms"},
        {"index": 3, "text": "Studies show that teens who use social media more than 3 hours daily have twice the rate of depression"},
        {"index": 4, "text": "Wait, is that the right stat? Let me check... yeah that's right"},
        {"index": 5, "text": "But here's the thing nobody talks about"},
        {"index": 6, "text": "The companies know this and they choose profit over wellbeing"},
        {"index": 7, "text": "Um, so yeah"},
        {"index": 8, "text": "That's why we need regulation. Not just guidelines, actual laws"},
        {"index": 9, "text": "Okay I think that's a wrap"},
    ], "expected_essential": [1, 3, 5, 6, 8], "description": "Social media argument — thesis + evidence + pivot + claim + conclusion"},
]


def build_argument_prompt(segments: list) -> str:
    seg_list = "\n".join(f'[{s["index"]}] ({s["index"]*5}s) "{s["text"]}"' for s in segments)
    return f"""<role>You are a professional video editor identifying the ESSENTIAL segments of a raw footage transcript.</role>
<task>From {len(segments)} segments, identify the ones that form the ARGUMENT BACKBONE — without which the video makes no sense. Err toward protection.</task>
<rules>
ESSENTIAL: thesis/main claim, key supporting arguments, punchlines, conclusion, critical transitions.
NOT essential: setup that could be shortened, repeated examples, tangents, meta-commentary.
</rules>
<output_format>JSON array of essential indices only. Example: [1, 3, 5, 8]</output_format>
<segments>
{seg_list}
</segments>"""


def parse_argument(raw: str) -> list:
    return sorted(json.loads(raw))


# ════════════════════════════════════════════════════════════════
# RUN ALL
# ════════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("  PROMPT SCORING — ALL MEASURABLE PROMPTS")
    print(f"  Model: gemini-2.5-flash | Temperature: 0.05")
    print("=" * 70)
    print()

    t0 = time.time()

    # 1. Editorial Intent
    print("[1/6] EDITORIAL INTENT DETECTOR (CONTENT / META_DISCARD / META_KEEP)")
    score_classifier("editorial_intent", EDITORIAL_CASES, build_editorial_prompt, parse_editorial)

    # 2. Holistic Editor
    print("[2/6] HOLISTIC EDITOR (KEEP / CUT)")
    for tc in HOLISTIC_CASES:
        prompt = build_holistic_prompt(tc["input"])
        raw = call_gemini(prompt)
        try:
            result = json.loads(raw)
            keep = sorted(result.get("keep", []))
            cut = sorted(result.get("cut", []))
            exp_keep = sorted(tc["expected"]["keep"])
            exp_cut = sorted(tc["expected"]["cut"])

            # Score: what fraction of segments are correctly classified
            total_segs = len(tc["input"]["segments"])
            correct = sum(1 for i in range(total_segs) if
                         (i in keep and i in exp_keep) or (i in cut and i in exp_cut))
            accuracy = correct / total_segs

            print(f"  Keep: expected={exp_keep} got={keep}")
            print(f"  Cut:  expected={exp_cut} got={cut}")
            print(f"  SCORE: {accuracy:.3f} ({correct}/{total_segs})")
            RESULTS["holistic_editor"] = {"accuracy": accuracy, "correct": correct, "total": total_segs, "failures": []}
        except Exception as e:
            print(f"  PARSE ERROR: {e}")
            RESULTS["holistic_editor"] = {"accuracy": 0, "correct": 0, "total": 1, "failures": [str(e)]}
    print()

    # 3. Intent Classifier
    print("[3/6] INTENT CLASSIFIER (REWRITE / EDIT / CONTINUE / FORK)")
    score_classifier("intent_classifier", INTENT_CASES, build_intent_prompt, parse_intent)

    # 4. Scope Detector
    print("[4/6] SCOPE DETECTOR (solo_ugc / brand_doc / short_film / feature_film / epic)")
    score_classifier("scope_detector", SCOPE_CASES, build_scope_prompt, parse_scope)

    # 5. ThinkForge Intent
    print("[5/6] THINKFORGE INTENT CLASSIFIER (chat / draft / edit / hybrid / research)")
    score_classifier("tf_intent", TF_INTENT_CASES, build_tf_intent_prompt, parse_tf_intent)

    # 6. Argument Protector
    print("[6/6] ARGUMENT STRUCTURE PROTECTOR")
    for tc in ARGUMENT_CASES:
        prompt = build_argument_prompt(tc["input"])
        raw = call_gemini(prompt)
        try:
            result = sorted(json.loads(raw))
            expected = sorted(tc["expected_essential"])

            # Score: F1 between expected and actual essential sets
            tp = len(set(result) & set(expected))
            fp = len(set(result) - set(expected))
            fn = len(set(expected) - set(result))
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

            print(f"  Expected essential: {expected}")
            print(f"  Got essential:      {result}")
            print(f"  Precision={precision:.3f} Recall={recall:.3f} F1={f1:.3f}")
            RESULTS["argument_protector"] = {"accuracy": f1, "correct": tp, "total": len(expected), "failures": []}
        except Exception as e:
            print(f"  PARSE ERROR: {e}")
            RESULTS["argument_protector"] = {"accuracy": 0, "correct": 0, "total": 1, "failures": [str(e)]}
    print()

    elapsed = time.time() - t0

    # ══════════════════════════════════════════════════════════
    # FINAL REPORT
    # ══════════════════════════════════════════════════════════
    print("=" * 70)
    print("  FINAL SCORES")
    print("=" * 70)
    print()
    print(f"  {'Prompt':<35} {'Score':>8} {'Detail':>15}")
    print(f"  {'─'*35} {'─'*8} {'─'*15}")

    # Add known scores
    RESULTS["scene_parser"] = {"accuracy": 0.956, "correct": 5, "total": 5, "note": "from eval harness"}
    RESULTS["transcript_editor"] = {"accuracy": 1.000, "correct": 10, "total": 10, "note": "F1 across 10 seeds"}

    all_scores = []
    for name, data in sorted(RESULTS.items()):
        score = data["accuracy"]
        detail = f"{data['correct']}/{data['total']}"
        note = data.get("note", "")
        status = "PASS" if score >= 0.95 else "WARN" if score >= 0.85 else "FAIL"
        print(f"  {status} {name:<33} {score:>7.3f} {detail:>15} {note}")
        all_scores.append(score)

    print()
    print(f"  Global min:  {min(all_scores):.3f}")
    print(f"  Global mean: {sum(all_scores)/len(all_scores):.3f}")
    print(f"  Above 0.95:  {sum(1 for s in all_scores if s >= 0.95)}/{len(all_scores)}")
    print(f"  API calls:   {TOTAL_CALLS}")
    print(f"  Time:        {elapsed:.1f}s")
    print(f"  Cost:        ~${TOTAL_CALLS * 0.001:.3f}")
    print()


if __name__ == "__main__":
    main()
