"""
Eval script for the 7 XML-restructured prompts.
Sends each prompt with a minimal test case to Gemini, checks output validity.
"""

import os
import json
import sys
import time
import urllib.request
import urllib.error

API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = "gemini-2.5-flash"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"

def call_gemini(prompt: str, temperature: float = 0.2, max_tokens: int = 1024) -> str:
    """Call Gemini API with a prompt, return text response."""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        candidates = body.get("candidates", [])
        if not candidates:
            return ""
        parts = candidates[0].get("content", {}).get("parts", [])
        return parts[0].get("text", "") if parts else ""
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8") if e.fp else ""
        return f"[HTTP {e.code}] {err_body[:300]}"
    except Exception as e:
        return f"[ERROR] {e}"


# ─── Test cases ───────────────────────────────────────────────────────────

def test_1_inpainting():
    """clickatron inpainting prompt"""
    prompt = """<role>You are an inpainting model. Your job is to fill ONLY the masked area while preserving everything else.</role>

<task>Modify ONLY the white masked area shown in the mask image according to the user prompt. The mask indicates WHERE to edit, the user prompt indicates WHAT to add/fill.</task>

<rules>
1. ONLY modify the white masked area shown in the mask image
2. Keep 100% of the non-masked areas EXACTLY unchanged - do not alter them at all
3. Blend the generated content seamlessly with the surrounding pixels
4. Match the lighting, style, resolution, color tone, and perspective of the original image
5. Do NOT regenerate or modify the entire image - this is inpainting, not text-to-image
6. Preserve all objects, people, and details outside the masked region
</rules>

<output_format>Modified image with ONLY the masked area changed, seamlessly blended with surroundings.</output_format>

User Request: fill the masked area with grass

Describe how you would execute this inpainting task. What would you do?"""
    result = call_gemini(prompt)
    # Check: does it mention inpainting / masked area / grass / blending?
    keywords = ["mask", "grass", "blend"]
    hits = sum(1 for k in keywords if k.lower() in result.lower())
    return hits >= 2, result


def test_2_variation():
    """clickatron image-to-image variation prompt"""
    prompt = """<role>You are an image editing model. Your job is to create a variation that stays true to the original while applying the requested changes.</role>

<task>Apply the user's requested changes to the original image while preserving its core composition, structure, and main subjects. The original image is the foundation - build upon it, don't replace it.</task>

<rules>
1. Preserve the core composition, structure, and main subjects of the original image
2. Apply the requested changes while maintaining consistency with the original image
3. Keep the same lighting style, color grading, and overall mood unless explicitly asked to change
4. Do NOT completely regenerate or reinterpret the entire image
5. Maintain the same level of detail, quality, and artistic style
6. Focus on making the specific changes requested while keeping everything else intact
7. CRITICAL: Maintain the EXACT aspect ratio and dimensions of the original image - do NOT change the image size or crop
</rules>

<output_format>Modified image variation with requested changes applied, preserving exact aspect ratio and dimensions.</output_format>

User Request: change the color to blue

Describe how you would execute this image editing task. What would you do?"""
    result = call_gemini(prompt)
    keywords = ["blue", "preserv", "original", "composition"]
    hits = sum(1 for k in keywords if k.lower() in result.lower())
    return hits >= 2, result


def test_3_legacy_editor():
    """legacy expert editor prompt with 2-scene context"""
    prompt = """<role>You are an expert video editor operating under the Director Knowledge Base - a professional film editing intelligence system.</role>

<task>Generate edit decisions for a 60s video at 30fps with 2 scenes. Every decision must serve Murch's Rule of Six hierarchy. When rules conflict, higher criteria win.</task>

<rules>
## CORE PHILOSOPHY (Murch's Rule of Six)
1. EMOTION (51%) - Does this make the viewer FEEL something?
2. STORY (23%) - Does this advance the narrative?
3. RHYTHM (10%) - Does this maintain or intentionally break the pacing pattern?
4. EYE-TRACE (7%) - Does this respect where the viewer's eye is?
5. 2D PLANE (5%) - Does the composition work?
6. 3D CONTINUITY (4%) - Does spatial continuity make sense?
CRITICAL: A technically perfect decision that kills emotion is a BAD decision.

## HARD BUDGETS
- Punch-zooms: MAX 6 per video
- Camera shakes: MAX 8 total
- Keyword graphics: MAX 14, minimum 3s apart

## ANTI-PATTERNS
- AP-001: Zoom-punch on every cut - max 3 per 30s
- AP-004: Dissolve between high-energy scenes - use hard-cut
</rules>

<output_format>Edit decisions per scene with Murch reasoning: zoom, transition, shake, filter, graphics, pacing - each justified by which Rule of Six criterion it serves.</output_format>

Scene 1: A chef slicing vegetables in a bright kitchen, upbeat narration about fresh ingredients, 30s duration, mood: energetic
Scene 2: Close-up of the finished dish with steam rising, soft music, 30s duration, mood: warm/nostalgic

Provide edit decisions for both scenes with Murch reasoning:"""
    result = call_gemini(prompt, max_tokens=2048)
    # Check: mentions Murch / emotion / zoom / transition / scene / cut / pacing
    keywords = ["murch", "emotion", "zoom", "transition", "scene", "cut", "pacing", "rule of six"]
    hits = sum(1 for k in keywords if k.lower() in result.lower())
    return hits >= 3, result


def test_4_subject_extractor():
    """subject extractor with 3 scene descriptions"""
    prompt = """<role>You are a senior concept artist doing pre-production for a video.</role>

<task>Read EVERY scene carefully and extract ALL visual subjects that could benefit from a reference image. Classify into two tiers: hero (auto-generated) and suggested (user-optional).</task>

<rules>
TIER 1 - "hero" (1-2 subjects): The absolute most important recurring subjects that MUST have reference images.
TIER 2 - "suggested" (3-10 subjects): Every other notable visual subject mentioned in the script.

WHAT TO EXTRACT:
- Characters/people (main AND secondary)
- Products (hero product AND any other products shown)
- Key objects (gadgets, tools, food items, symbols, props)
- Vehicles

WHAT TO SKIP:
- Generic settings/locations
- Abstract concepts, moods
</rules>

<output_format>JSON object with "hero" array (1-2 subjects) and "suggested" array (3-10 subjects). Each subject includes: name, category, tier, visualDescription, sceneAppearances.</output_format>

<input_data>
Scene 1: A young woman in her 20s with curly red hair and a vintage leather jacket rides a cobalt blue Vespa scooter through narrow Italian streets.
Scene 2: She stops at a small cafe and orders an espresso in a hand-painted ceramic cup, chatting with an elderly barista with a thick grey mustache.
Scene 3: She pulls out a worn Moleskine notebook and sketches the cafe facade, her silver ring catching the sunlight.
</input_data>

Extract ALL subjects now (heroes + suggestions):"""
    result = call_gemini(prompt, max_tokens=2048)
    # Check: mentions hero / suggested / woman / Vespa / barista
    keywords = ["hero", "suggest", "woman", "vespa", "barista"]
    hits = sum(1 for k in keywords if k.lower() in result.lower())
    has_json_structure = "{" in result and "}" in result
    return hits >= 3 and has_json_structure, result


def test_5_html_editor():
    """html-scene editor with simple HTML + edit request"""
    prompt = """<role>You are an expert HTML/CSS editor.</role>

<task>Modify the provided HTML code according to the user's edit request while preserving overall structure and functionality. Canvas: 1920x1080px.</task>

<rules>
1. Return ONLY the modified HTML. NO markdown fences. NO explanations.
2. Preserve the outer wrapper structure (position:absolute; inset:0; width:100%; height:100%;)
3. Do NOT use viewport units (vw, vh) - use % or px instead
4. Keep animations and interactive elements working
5. Make targeted changes based on the user's request
6. Maintain the same level of quality and polish
</rules>

<output_format>Raw HTML string only, starting with <. No markdown, no code fences, no explanations.</output_format>

CURRENT HTML:
<div style="position:absolute; inset:0; width:100%; height:100%; background: white; display:flex; align-items:center; justify-content:center;">
  <h1 style="font-size: 72px; color: black;">Hello World</h1>
</div>

EDIT REQUEST:
Change the background to red and make the text white

Return the modified HTML:"""
    result = call_gemini(prompt)
    result_lower = result.lower()
    has_red = "red" in result_lower or "#ff0000" in result_lower or "rgb(255" in result_lower
    has_white_text = "white" in result_lower or "#fff" in result_lower
    has_html = "<div" in result_lower and "<h1" in result_lower
    return has_red and has_white_text and has_html, result


def test_6_enhance():
    """creative director enhance prompt"""
    prompt = """<role>You are an expert creative director and YouTube producer.</role>

<task>The user will give you a very short, generic idea or niche. Return a highly detailed, exciting, and specific 2-3 sentence video concept. Make it cinematic, trendy, and highly specific.</task>

<rules>
1. Do not include any conversational filler (no 'Here is an idea:')
2. Just return the enhanced prompt directly
3. Do not use quotes
</rules>

<output_format>2-3 sentence detailed video concept. No preamble, no quotes, no filler - just the concept.</output_format>

cooking video"""
    result = call_gemini(prompt, temperature=0.8)
    # Check: 2-3 sentences, no filler like "Here is", mentions cooking/food/kitchen/baking/culinary
    has_cooking_ref = any(k in result.lower() for k in ["cook", "food", "kitchen", "chef", "recipe", "culinar", "bak", "dough", "ingredient", "dish", "meal", "gastr"])
    no_filler = not result.lower().startswith("here is") and not result.lower().startswith("sure")
    sentence_count = result.count(".") + result.count("!") + result.count("?")
    return has_cooking_ref and no_filler and sentence_count >= 2, result


def test_7_observer():
    """observer fact extractor"""
    prompt = """<role>You are a silent observer extracting actionable facts from a user's writing or chat session.</role>

<task>Analyze the provided text and extract ALL clear facts: user preferences, rules, personal info, structural habits, technical claims, or audience insights.</task>

<rules>
1. Even short statements like "my name is X" or "I like Y" are valid facts. Extract them with confidence >= 0.5.
2. Extract personal info (name, role, channel name), preferences, rules, habits, and opinions.
3. If a preference is universal (e.g. "I hate puns", "my name is X"), mark scope as "global". If project-specific, mark "project".
</rules>

<output_format>Array of facts, each with: type (preference|rule|personal_info|habit|opinion), content, confidence (0-1), scope (global|project).</output_format>

<input_data>
Text from editor:
\"\"\"
My name is Alex and I run a tech review channel called GadgetPulse. I always start videos with a hook question. I hate clickbait thumbnails. For this project, I want a dark moody aesthetic. My audience is mostly 18-35 male tech enthusiasts.
\"\"\"
</input_data>"""
    result = call_gemini(prompt, max_tokens=2048)
    # Check: mentions Alex, GadgetPulse, confidence, scope, preference/personal_info
    keywords = ["alex", "gadgetpulse", "confidence", "scope", "personal_info"]
    hits = sum(1 for k in keywords if k.lower() in result.lower())
    has_array = "[" in result or "facts" in result.lower()
    return hits >= 3 and has_array, result


# ─── Runner ───────────────────────────────────────────────────────────────

TESTS = [
    ("1. Inpainting (clickatron)", test_1_inpainting),
    ("2. Variation (clickatron)", test_2_variation),
    ("3. Legacy Editor (unified-edit-intelligence)", test_3_legacy_editor),
    ("4. Subject Extractor (llm-scene-parser)", test_4_subject_extractor),
    ("5. HTML Scene Editor (html-scene/edit)", test_5_html_editor),
    ("6. Enhance (thinkforge/enhance)", test_6_enhance),
    ("7. Observer (thinkforge/observe)", test_7_observer),
]


def main():
    if not API_KEY:
        print("ERROR: GEMINI_API_KEY not set")
        sys.exit(1)

    print("=" * 70)
    print("  XML Prompt Restructuring - Eval (7 prompts)")
    print("=" * 70)
    print()

    results = []
    total_pass = 0

    for name, test_fn in TESTS:
        print(f"[TEST] {name}")
        try:
            passed, output = test_fn()
            status = "PASS" if passed else "FAIL"
            if passed:
                total_pass += 1
            # Show first 200 chars of output
            preview = output[:200].replace("\n", " ")
            print(f"  -> {status}")
            print(f"  -> Preview: {preview}...")
        except Exception as e:
            status = "ERROR"
            print(f"  -> ERROR: {e}")
            output = str(e)
            passed = False

        results.append({"name": name, "status": status, "passed": passed})
        print()
        # Rate limit: 1s between calls
        time.sleep(1.0)

    # Summary
    print("=" * 70)
    print(f"  RESULTS: {total_pass}/{len(TESTS)} passed")
    print("=" * 70)
    for r in results:
        marker = "OK" if r["passed"] else "XX"
        print(f"  [{marker}] {r['name']}")
    print()

    if total_pass == len(TESTS):
        print("All 7 XML-restructured prompts produce valid output.")
    else:
        failed = [r["name"] for r in results if not r["passed"]]
        print(f"Failed: {', '.join(failed)}")

    return 0 if total_pass == len(TESTS) else 1


if __name__ == "__main__":
    sys.exit(main())
