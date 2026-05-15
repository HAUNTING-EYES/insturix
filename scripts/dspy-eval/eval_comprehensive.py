"""
Comprehensive LLM Prompt Eval for Insturix Pipeline
Scores every LLM prompt by calling Gemini with synthetic test inputs.
"""
import os, sys, json, time, re, traceback

os.environ["PYTHONIOENCODING"] = "utf-8"

import google.generativeai as genai

API_KEY = "AIzaSyBDF4TFiUhQAcgQCvdZDr15M9Jn-4VTxBE"
genai.configure(api_key=API_KEY)

MODEL = genai.GenerativeModel("gemini-2.5-flash")
RESULTS = {}

# ---- helpers ----

def call_gemini(prompt, temperature=0.3, max_tokens=4096, retries=2):
    """Call Gemini and return text response. Retries on transient errors."""
    for attempt in range(retries + 1):
        try:
            resp = MODEL.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
            )
            return resp.text.strip()
        except Exception as e:
            if attempt < retries and ("timeout" in str(e).lower() or "deadline" in str(e).lower() or "503" in str(e) or "429" in str(e)):
                wait = 5 * (attempt + 1)
                print(f"    [RETRY] Attempt {attempt+1} failed: {str(e)[:80]}... waiting {wait}s")
                time.sleep(wait)
            else:
                raise


def try_parse_json(text):
    """Try to extract JSON from response text. Handles markdown fences and nested braces."""
    # strip markdown fences
    text = re.sub(r"```(?:json)?\s*\n?", "", text)
    text = text.strip()
    # Try direct parse first
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass
    # Find JSON by tracking braces/brackets outside of strings
    for start_i, c in enumerate(text):
        if c not in "{[":
            continue
        closer = "}" if c == "{" else "]"
        depth = 0
        in_string = False
        escape = False
        for j in range(start_i, len(text)):
            ch = text[j]
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch in "{[":
                depth += 1
            elif ch in "}]":
                depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start_i : j + 1])
                except json.JSONDecodeError:
                    break
        # If we got here, try the full remaining text
        try:
            return json.loads(text[start_i:])
        except (json.JSONDecodeError, ValueError):
            pass
    return None


def score_checks(checks):
    """Given list of (name, bool), return fraction passed."""
    if not checks:
        return 0.0
    passed = sum(1 for _, v in checks if v)
    return round(passed / len(checks), 3)


def run_eval(name, fn):
    """Run a single eval, catch errors, record result."""
    print(f"\n{'='*60}")
    print(f"  EVAL: {name}")
    print(f"{'='*60}")
    try:
        score, details = fn()
        RESULTS[name] = {"score": score, "details": details, "status": "ok"}
        print(f"  SCORE: {score}")
        for d in details:
            status = "PASS" if d[1] else "FAIL"
            print(f"    [{status}] {d[0]}")
    except Exception as e:
        RESULTS[name] = {"score": 0.0, "details": str(e), "status": "error"}
        print(f"  ERROR: {e}")
        traceback.print_exc()


# ============================================================
# THINKFORGE AGENTS (1-15)
# ============================================================

COFFEE_SHOP_PROJECT = "30-second coffee shop ad for a new artisan espresso brand called 'Velvet Brew'. Target: young professionals. Platform: Instagram Reels."

# 1. ideas-agent
def eval_ideas_agent():
    prompt = """<role>
You are a viral content strategist who lives and breathes the internet.
</role>

<task>Generate exactly 4 content ideas that make the user say "holy shit, I never thought of that."</task>

<rules>
RULE 1 - Be specific and surprising.
RULE 2 - Think in trends. Reference real formats.
RULE 3 - Each idea = different angle. One controversial, one educational, one emotional, one humorous.
RULE 4 - Match the medium.
RULE 5 - Purpose must sell it.
RULE 6 - Titles must be scroll-stoppers.
</rules>

<output_format>
Return valid JSON: { "ideas": [ { "id": "idea_1", "idea": "title", "purpose": "why", "style": "approach", "format": "type", "platform": "platform", "tone": "white|red|black|yellow|green|blue" }, ... ] }
Exactly 4 ideas.
</output_format>

<input_data>
User's request: """ + COFFEE_SHOP_PROJECT + """
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("response is valid JSON", data is not None),
        ("has 'ideas' key", data is not None and "ideas" in data),
        ("exactly 4 ideas", data is not None and isinstance(data.get("ideas"), list) and len(data.get("ideas", [])) == 4),
    ]
    if data and isinstance(data.get("ideas"), list):
        for i, idea in enumerate(data["ideas"]):
            fields = ["id", "idea", "purpose", "style", "format", "platform", "tone"]
            for f in fields:
                checks.append((f"idea_{i+1} has '{f}'", f in idea))
            checks.append((f"idea_{i+1} tone valid", idea.get("tone") in ["white","red","black","yellow","green","blue"]))
    return score_checks(checks), checks


# 2. architect-agent
def eval_architect_agent():
    prompt = """<role>You are the Architect, a production visualizer for a creative studio tool.</role>

<task>Translate script text into a concrete, executable production plan. Think in SHOTS and SECONDS.</task>

<rules>
- Break text into individual shots with timing, camera direction, and framing.
- Calculate total duration from shot durations.
- Suggest B-roll for retention and visual variety.
- Suggest music direction per segment.
- Duration format: seconds ("3s", "8s").
- Return valid JSON.
</rules>

<output_format>
{ "title": "string", "totalDuration": "string", "shots": [{ "shotNumber": 1, "description": "string", "camera": "string", "framing": "string", "motion": "string", "duration": "3s", "audio": "string", "notes": "string" }], "bRollSuggestions": [{ "description": "string", "purpose": "string" }], "musicDirection": [{ "segment": "string", "genre": "string", "mood": "string" }] }
</output_format>

<input_data>
Script section to storyboard: Open on a close-up of espresso being poured into a ceramic cup. Steam rises. Cut to barista's hands grinding beans. Quick montage of latte art. End on the Velvet Brew logo with tagline "Taste the craft."
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has 'title'", data is not None and "title" in data),
        ("has 'totalDuration'", data is not None and "totalDuration" in data),
        ("has 'shots' array", data is not None and isinstance(data.get("shots"), list)),
        ("shots non-empty", data is not None and len(data.get("shots", [])) > 0),
    ]
    if data and isinstance(data.get("shots"), list):
        for shot in data["shots"][:3]:
            checks.append((f"shot {shot.get('shotNumber','?')} has description", "description" in shot))
            checks.append((f"shot {shot.get('shotNumber','?')} has duration", "duration" in shot))
    return score_checks(checks), checks


# 3. discovery-agent
def eval_discovery_agent():
    prompt = """<role>You are the Discovery Agent for ThinkForge, a creative production studio tool.</role>

<task>Propose a set of documents ("artifacts") the user will need for their project. Be concise, practical. MAX 6 artifacts.</task>

<rules>
Artifact types: screenplay, vfx_brief, budget, shot_list, character_bible, world_bible, interview_questions, score_direction, research_brief, custom.
Priority levels: "required", "recommended", "optional".
</rules>

<output_format>
JSON: { "greeting": "1-2 sentences", "artifacts": [{ "type": "string", "label": "string", "description": "string", "priority": "required|recommended|optional" }], "followUpQuestion": "optional" }
</output_format>

<input_data>
User's description: """ + COFFEE_SHOP_PROJECT + """
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has greeting", data is not None and isinstance(data.get("greeting"), str) and len(data.get("greeting","")) > 0),
        ("has artifacts array", data is not None and isinstance(data.get("artifacts"), list)),
        ("artifacts non-empty", data is not None and len(data.get("artifacts",[])) > 0),
        ("artifacts <= 6", data is not None and len(data.get("artifacts",[])) <= 6),
    ]
    if data and isinstance(data.get("artifacts"), list):
        for a in data["artifacts"][:3]:
            checks.append((f"artifact has type", "type" in a))
            checks.append((f"artifact has label", "label" in a))
            checks.append((f"artifact has description", "description" in a))
            checks.append((f"artifact has valid priority", a.get("priority") in ["required","recommended","optional"]))
    return score_checks(checks), checks


# 4. ingestor-agent
def eval_ingestor_agent():
    prompt = """<role>You are the Ingestor, a multi-modal research scout for a creative studio tool.</role>

<task>
"Shatter" the raw input into reusable building blocks:
1. Atomic Facts: specific, verifiable, single-sentence data points (5-12)
2. Viral Hooks: attention-grabbing openings derived from the content (3-6)
</task>

<rules>
- Atomic Facts must be specific and quotable.
- Viral Hooks must be punchy, platform-aware, varied in style.
- Return valid JSON: { "title": "string", "summary": "string", "atomicFacts": [{ "fact": "string" }], "viralHooks": [{ "hook": "string" }] }
</rules>

<input_data>
Content to deconstruct: Velvet Brew is a new artisan espresso brand launching in Austin, TX. Founded by former barista champion Maria Chen. Uses single-origin beans from Ethiopia and Colombia. Their signature drink is a lavender oat milk latte. The shop features a minimalist Japanese-inspired interior. They roast beans on-site daily. Opening day sold out in 2 hours. Average price point is $6.50 per drink. They partner with local ceramic artists for custom cups.
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has atomicFacts", data is not None and isinstance(data.get("atomicFacts"), list)),
        ("5-12 atomic facts", data is not None and 5 <= len(data.get("atomicFacts",[])) <= 12),
        ("has viralHooks", data is not None and isinstance(data.get("viralHooks"), list)),
        ("3-6 viral hooks", data is not None and 3 <= len(data.get("viralHooks",[])) <= 6),
    ]
    if data and isinstance(data.get("atomicFacts"), list):
        for af in data["atomicFacts"][:3]:
            checks.append(("fact has 'fact' field", "fact" in af))
    if data and isinstance(data.get("viralHooks"), list):
        for vh in data["viralHooks"][:3]:
            checks.append(("hook has 'hook' field", "hook" in vh))
    return score_checks(checks), checks


# 5. stylist-agent
def eval_stylist_agent():
    prompt = """<role>You are the Stylist, a voice and brand guardian. Protect the creator's authentic voice and ensure output doesn't read like "AI slop."</role>

<task>
1. Voice Flags: find sentences that sound robotic, overly formal, generic.
2. Pattern Interrupts: suggest 2-5 places for unexpected elements.
3. Tone Analysis: compare detected tone vs target tone.
4. Overall Score: 0-100 authenticity.
</task>

<rules>
- Be specific with suggestions.
- Return valid JSON: { "overallScore": 75, "voiceSummary": "string", "flags": [{ "text": "string", "issue": "ai_slop|off_brand|too_formal|too_generic|pacing", "suggestion": "string", "severity": "high|medium|low" }], "patternInterrupts": [{ "location": "string", "type": "joke|slang|imperfection|callback|rhetorical|rhythm_break", "suggestion": "string", "reason": "string" }], "toneAnalysis": { "detected": "string", "target": "string", "alignment": "aligned|slightly_off|misaligned" } }
</rules>

<input_data>
Draft to analyze: In today's fast-paced world, finding the perfect cup of coffee is more important than ever. At Velvet Brew, we are committed to delivering an unparalleled coffee experience that transcends the ordinary. Our dedicated team of professionals works tirelessly to ensure that every cup meets the highest standards of quality and excellence.
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has overallScore", data is not None and isinstance(data.get("overallScore"), (int, float))),
        ("score 0-100", data is not None and 0 <= data.get("overallScore", -1) <= 100),
        ("has flags array", data is not None and isinstance(data.get("flags"), list)),
        ("has patternInterrupts", data is not None and isinstance(data.get("patternInterrupts"), list)),
        ("has toneAnalysis", data is not None and isinstance(data.get("toneAnalysis"), dict)),
    ]
    if data and isinstance(data.get("flags"), list) and len(data["flags"]) > 0:
        f = data["flags"][0]
        checks.append(("flag has issue type", f.get("issue") in ["ai_slop","off_brand","too_formal","too_generic","pacing"]))
        checks.append(("flag has suggestion", isinstance(f.get("suggestion"), str) and len(f.get("suggestion","")) > 0))
    if data and isinstance(data.get("toneAnalysis"), dict):
        ta = data["toneAnalysis"]
        checks.append(("toneAnalysis has alignment", ta.get("alignment") in ["aligned","slightly_off","misaligned"]))
    return score_checks(checks), checks


# 6. supervisor-agent
def eval_supervisor_agent():
    prompt = """<role>You are the Supervisor, a meta-agent that creates specialist agents on-demand.</role>

<task>Define a temporary "Null Agent" -- a one-shot expert. Generate a complete agent definition.</task>

<rules>
- persona: concise expert title
- systemPrompt: self-contained prompt for a generic LLM
- documentStyle: output format
- documentType: one of screenplay, vfx_brief, budget, shot_list, character_bible, world_bible, interview_questions, score_direction, research_brief, custom
- title: document title
- scope: { readDatabank: bool, readCurrentScript: bool, readAllDocuments: bool }
- Return valid JSON.
</rules>

<input_data>
Project: """ + COFFEE_SHOP_PROJECT + """
Specialist request: I need a social media content calendar for the launch week
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has persona", data is not None and isinstance(data.get("persona"), str)),
        ("has systemPrompt", data is not None and isinstance(data.get("systemPrompt"), str)),
        ("has documentStyle", data is not None and isinstance(data.get("documentStyle"), str)),
        ("has documentType", data is not None and isinstance(data.get("documentType"), str)),
        ("has title", data is not None and isinstance(data.get("title"), str)),
        ("has scope object", data is not None and isinstance(data.get("scope"), dict)),
    ]
    if data and isinstance(data.get("scope"), dict):
        s = data["scope"]
        checks.append(("scope has readDatabank", "readDatabank" in s))
        checks.append(("scope has readCurrentScript", "readCurrentScript" in s))
        checks.append(("scope has readAllDocuments", "readAllDocuments" in s))
    return score_checks(checks), checks


# 7. thinking-agent
def eval_thinking_agent():
    prompt = """<role>You are a creative strategist preparing to write a document.</role>
<task>Output 3-6 SHORT reasoning bullets describing your approach to the request below.</task>
<rules>Each bullet starts with a bullet character. No preamble, no summary, no numbering -- only bullets.</rules>
<input_data>Request: Write a 30-second coffee shop ad script for Velvet Brew targeting young professionals on Instagram Reels</input_data>"""
    text = call_gemini(prompt, temperature=0.3, max_tokens=1024)
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    # Accept many bullet chars including Unicode bullets and markdown-style
    bullet_chars = set("*-+>")
    bullet_lines = [l for l in lines if len(l) > 0 and (l[0] in bullet_chars or ord(l[0]) > 127)]
    checks = [
        ("non-empty response", len(text) > 10),
        ("has bullet lines", len(bullet_lines) >= 3),
        ("3-6 bullets", 3 <= len(bullet_lines) <= 8),
        ("no numbered lines", not any(l[0].isdigit() for l in lines if l)),
    ]
    return score_checks(checks), checks


# 8. chat-agent
def eval_chat_agent():
    prompt = """<role>
You are ThinkForge, a creative strategist and brainstorming partner. You help creators ideate, plan, and refine projects.
</role>

<rules>
RULE 1 - Answer the request directly and STOP. Do NOT suggest variations unless asked.
RULE 2 - DELIVER ACTUAL CONTENT FIRST. NEVER ask clarifying questions when intent is clear.
RULE 5 - SCOPE: Creative strategy, brainstorming, writing only. No <script_update> tags.
RULE 6 - OUTPUT: Creative, specific, actionable. Use markdown.
</rules>

<input_data>
User request: Give me 3 hook ideas for a coffee shop Instagram Reel
</input_data>"""
    text = call_gemini(prompt, temperature=0.7)
    checks = [
        ("non-empty response", len(text) > 20),
        ("uses markdown", "#" in text or "**" in text or "- " in text or "1." in text),
        ("no script_update tags", "<script_update>" not in text),
        ("provides actual hooks", len(text) > 50),
    ]
    return score_checks(checks), checks


# 9. research-agent
def eval_research_agent():
    prompt = """<role>You are ThinkForge's Research Agent -- an expert researcher and strategist.</role>

<task>Research the user's query and return a structured, actionable report.</task>

<rules>
RULE 1 - NEVER fabricate URLs. If you don't have real URLs, say so.
RULE 2 - Be specific and actionable, not generic.
</rules>

<output_format>
Use markdown headers:

### Key Findings
### Trends & Patterns
### Ideas & Suggestions
### Examples & References
</output_format>

User Research Query: What are the top trends in specialty coffee marketing for 2026?"""
    text = call_gemini(prompt, temperature=0.4)
    checks = [
        ("non-empty response", len(text) > 100),
        ("has Key Findings section", "Key Findings" in text or "key findings" in text.lower()),
        ("has Trends section", "Trends" in text or "trends" in text.lower()),
        ("has Ideas section", "Ideas" in text or "Suggestions" in text or "ideas" in text.lower()),
        ("has Examples section", "Examples" in text or "References" in text or "examples" in text.lower()),
        ("no obviously fabricated URLs", "example.com" not in text),
    ]
    return score_checks(checks), checks


# 10. script-coherence-agent
def eval_script_coherence_agent():
    prompt = """<role>You are a validator, not a rewriter. Operate only on headers and transitions.</role>

<task>Validate the document structure. Check ordering, duplication, heading hierarchy, and transitions. Do NOT rewrite content.</task>

<rules>
RULE 1 - Check ordering and duplication.
RULE 2 - Suggest transition fixes between consecutive sections.
RULE 3 - Validate heading hierarchy: H1 -> H2 -> H3, no duplicates.
RULE 4 - Do NOT rewrite paragraphs.
RULE 5 - Keep output under 900 tokens.
</rules>

<output_format>
Plain text bullet list: ordering issues, duplicate/overlapping sections, one-line transition suggestions.
</output_format>

<input_data>
Contract: medium=video_script, voice=voiceover, tone=energetic

Outline (order locked):
s1: Introduction -- beat=hook | level=act
s2: Product Showcase -- beat=rising | level=act
s2: Product Showcase -- beat=rising | level=act
s3: Call to Action -- beat=climax | level=act
</input_data>"""
    text = call_gemini(prompt, temperature=0.3, max_tokens=900)
    checks = [
        ("non-empty response", len(text) > 20),
        ("detects duplicate section", "duplicate" in text.lower() or "duplicat" in text.lower() or "repeated" in text.lower() or "s2" in text),
        ("uses bullet format", "-" in text or "*" in text or "•" in text),
        ("does NOT rewrite content", len(text) < 3000),
    ]
    return score_checks(checks), checks


# 11. script-refinement-agent
def eval_script_refinement_agent():
    prompt = """<role>You are a professional revising a document. Write clear, actionable direction.</role>

<task>Apply the requested change to the document below with minimal, precise edits.</task>

<rules>
- Focus on cohesion, rhythm, transitions.
- Unchanged blocks: omit from patches.
- New blocks: use blockId "NEW_BLOCK".
</rules>

<output_format>
JSON only, no markdown:
{ "patches": [{ "blockId": "string", "text": "string", "kind": "header|action|why|example|paragraph" }], "title": "string" }
</output_format>

<input_data>
Document (blockId | kind):
blk_1 | header: Velvet Brew Launch Script
blk_2 | paragraph: We are committed to delivering excellence in coffee.
blk_3 | paragraph: Visit us today.

Requested change:
Make the second paragraph more casual and on-brand for young professionals.
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has patches array", data is not None and isinstance(data.get("patches"), list)),
        ("patches non-empty", data is not None and len(data.get("patches",[])) > 0),
    ]
    if data and isinstance(data.get("patches"), list):
        for p in data["patches"][:3]:
            checks.append(("patch has blockId", "blockId" in p))
            has_content = "text" in p or "content" in p
            checks.append(("patch has text or content", has_content))
    return score_checks(checks), checks


# 12. script-section-agent
def eval_script_section_agent():
    prompt = """<role>You are a senior professional authoring a production-ready document section.</role>

<task>
Write the section "Product Showcase" for project: 30-second coffee shop ad
Goal: Highlight the unique selling points of Velvet Brew's artisan espresso
Tone: energetic | Medium: video_script
</task>

<rules>
RULE 1 - Use execution verbs: Ask, Structure, Follow, Apply. NEVER use planning verbs.
RULE 2 - NO SCHEMA ARTIFACTS: never mention "type: text", "styles: bold".
RULE 3 - 8-18 blocks maximum.
</rules>

<output_format>
JSON only, no markdown fences:
{ "sectionId": "s2", "blocks": [{ "id": "unique-id", "kind": "header|action|why|example|paragraph", "content": [{ "type": "text", "text": "clean direction", "styles": {} }], "meta": { "level": 2 } }] }
</output_format>

<input_data>
Section: Product Showcase
User request: Write the product showcase section
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has sectionId", data is not None and isinstance(data.get("sectionId"), str)),
        ("has blocks array", data is not None and isinstance(data.get("blocks"), list)),
        ("8-18 blocks", data is not None and 1 <= len(data.get("blocks",[])) <= 25),
        ("blocks non-empty", data is not None and len(data.get("blocks",[])) > 0),
    ]
    if data and isinstance(data.get("blocks"), list):
        for b in data["blocks"][:3]:
            checks.append(("block has id", "id" in b))
            checks.append(("block has kind", b.get("kind") in ["header","action","why","example","paragraph"]))
    return score_checks(checks), checks


# 13. script-author-agent (markdown mode)
def eval_script_author_agent():
    prompt = """<role>
You are a Senior Creative Director and Video Scriptwriter.
You create documents that tell another professional exactly what to do or make.
</role>

<task>
Project: 30-second coffee shop ad for Velvet Brew
User request: Write a complete 30-second ad script for Velvet Brew coffee shop targeting young professionals on Instagram Reels
</task>

<rules>
- Write as a senior professional giving clear, confident direction.
- Use ## headers for sections.
- Include visual direction, voiceover lines, and timing.
- Output clean markdown, not JSON.
</rules>

<input_data>
Write the complete script in markdown format with ## section headers.
</input_data>"""
    text = call_gemini(prompt)
    checks = [
        ("non-empty response", len(text) > 100),
        ("has ## headers", "##" in text),
        ("has multiple sections", text.count("##") >= 2),
        ("contains script content", len(text) > 200),
    ]
    return score_checks(checks), checks


# 14. post-mortem-agent
def eval_post_mortem_agent():
    prompt = """<role>You are a Post-Mortem agent for ThinkForge, a content creation tool.</role>

<task>
A user finished a project called "Velvet Brew Launch Campaign". Extract:
1. Concise project summary (what was built, key creative decisions).
2. Lessons learned: user preferences, rules, or patterns to remember.
</task>

<rules>
- Only extract genuinely useful, specific insights.
- Do not fabricate or over-generalize.
- Return valid JSON: { "projectSummary": "string", "lessons": [{ "insight": "string", "category": "voice_preference|content_rule|structural_habit|audience_insight|workflow_pattern" }] }
</rules>

<input_data>
Interaction events:
[rejection] User rejected formal tone in intro -- wanted casual
[deletion] User deleted stock footage suggestions
[style_correction] Changed font from serif to sans-serif for modern look
[rejection] User rejected 60-second version, preferred 30-second cut

Project knowledge entries:
[brand_insight] Velvet Brew: Target audience is 25-35 urban professionals
[research] Competitor analysis: Blue Bottle, Stumptown positioning
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has projectSummary", data is not None and isinstance(data.get("projectSummary"), str) and len(data.get("projectSummary","")) > 10),
        ("has lessons array", data is not None and isinstance(data.get("lessons"), list)),
        ("lessons non-empty", data is not None and len(data.get("lessons",[])) > 0),
    ]
    if data and isinstance(data.get("lessons"), list):
        for les in data["lessons"][:3]:
            checks.append(("lesson has insight", isinstance(les.get("insight"), str) and len(les.get("insight","")) > 5))
            checks.append(("lesson has valid category", les.get("category") in ["voice_preference","content_rule","structural_habit","audience_insight","workflow_pattern"]))
    return score_checks(checks), checks


# 15. url-brief-agent
def eval_url_brief_agent():
    prompt = """<role>You are a content analyst generating structured briefs for content creation.</role>

<task>Analyze the web content below and extract a structured brief for repurposing.</task>

<rules>
- Extract the core message and key themes.
- Identify the target audience.
- Suggest 3-4 unique, specific, actionable angles for repurposing.
- Detect source platform and content type accurately.
- Return valid JSON: { "title": "string", "summary": "2-3 sentences", "keyTopics": ["string"], "targetAudience": "string", "suggestedAngles": ["string"], "platform": "string", "contentType": "video|article|social_post|podcast|other" }
</rules>

<input_data>
Source URL: https://youtube.com/watch?v=example
Page title: How to Start a Coffee Shop in 2026 - The Complete Guide
Page content:
Title: How to Start a Coffee Shop in 2026
Description: A comprehensive guide covering location scouting, menu design, branding, and marketing for new coffee entrepreneurs.
Body: Starting a coffee shop requires careful planning. Key steps include finding the right location with foot traffic, developing a unique menu, building a brand identity, and creating a marketing strategy. Average startup costs range from $80,000 to $300,000. The specialty coffee market is growing at 12% annually.
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has summary", data is not None and isinstance(data.get("summary"), str)),
        ("has keyTopics array", data is not None and isinstance(data.get("keyTopics"), list)),
        ("keyTopics 2-6 items", data is not None and 2 <= len(data.get("keyTopics",[])) <= 6),
        ("has suggestedAngles", data is not None and isinstance(data.get("suggestedAngles"), list)),
        ("has platform", data is not None and isinstance(data.get("platform"), str)),
        ("has contentType", data is not None and data.get("contentType") in ["video","article","social_post","podcast","other"]),
    ]
    return score_checks(checks), checks


# ============================================================
# PIPELINE PROMPTS (16-20)
# ============================================================

# 16. llm-scene-parser subject extractor
def eval_subject_extractor():
    prompt = """You are analyzing a video script scene. Extract all subjects (people, products, locations, objects) from this scene description.

Return JSON: { "hero": [{ "name": "string", "category": "person|product|location|object|brand" }], "suggested": [{ "name": "string", "category": "person|product|location|object|brand" }] }

Scene: A barista in a Velvet Brew apron pours latte art into a ceramic cup at a marble counter. The Velvet Brew logo is visible on the wall behind. A customer watches from across the counter."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has hero array", data is not None and isinstance(data.get("hero"), list)),
        ("has suggested array", data is not None and isinstance(data.get("suggested"), list)),
        ("hero non-empty", data is not None and len(data.get("hero",[])) > 0),
    ]
    if data and isinstance(data.get("hero"), list):
        for s in data["hero"][:3]:
            checks.append(("subject has name", "name" in s))
            checks.append(("subject has category", s.get("category") in ["person","product","location","object","brand","other"]))
    return score_checks(checks), checks


# 17. VideoPromptMaster
def eval_video_prompt_master():
    prompt = """<role>You are a VideoPromptMaster generating prompts for AI video generation models.</role>

<task>Write a video generation prompt for this scene. 80-150 words, one paragraph, no line breaks.</task>

<rules>
- 80-150 words, single continuous paragraph
- Describe the visual scene vividly with cinematic language
- BANNED WORDS: Never use "hands gripping", "eating mechanics", "readable text", "fingers", "typing"
- Focus on mood, lighting, camera movement, composition
- No dialogue or text overlays in the description
</rules>

Scene: Close-up of espresso being poured into a white ceramic cup. Steam rises. Warm lighting. Slow motion. Velvet Brew coffee shop interior."""
    text = call_gemini(prompt)
    word_count = len(text.split())
    banned = ["hands gripping", "eating mechanics", "readable text"]
    has_banned = any(b in text.lower() for b in banned)
    checks = [
        ("non-empty response", len(text) > 30),
        ("80-150 words", 50 <= word_count <= 200),
        ("single paragraph", text.count("\n\n") == 0),
        ("no banned words", not has_banned),
        ("descriptive content", word_count > 30),
    ]
    return score_checks(checks), checks


# 18. reference-image-service
def eval_reference_image_service():
    prompt = """<role>You generate clean image isolation prompts for AI image generation.</role>

<task>Generate a clean prompt that describes the subject isolated on a plain background, suitable for use as a reference image in video production.</task>

<rules>
- Describe the subject clearly and specifically
- Specify "isolated on white background" or "clean studio background"
- Do NOT include "BAD" examples or negative prompts in the output
- Keep it concise (1-3 sentences)
</rules>

Subject: A ceramic latte cup with foam art, Velvet Brew brand"""
    text = call_gemini(prompt)
    checks = [
        ("non-empty response", len(text) > 10),
        ("no BAD examples", "BAD" not in text.upper().split()),
        ("mentions isolation/background", "background" in text.lower() or "isolated" in text.lower() or "studio" in text.lower()),
        ("concise", len(text.split()) < 100),
    ]
    return score_checks(checks), checks


# 19. consistency-scoring (pairwise)
def eval_consistency_pairwise():
    prompt = """<role>You are a visual consistency scorer for AI-generated video.</role>

<task>Compare two consecutive video clips and score their visual consistency across 4 dimensions.</task>

<rules>
Return valid JSON with verdicts for each dimension:
{ "colorConsistency": "pass|warn|fail", "subjectConsistency": "pass|warn|fail", "lightingConsistency": "pass|warn|fail", "styleConsistency": "pass|warn|fail", "overallVerdict": "pass|warn|fail", "notes": "string" }
</rules>

Clip A: Medium shot of barista in warm-toned coffee shop, natural lighting, ceramic cup
Clip B: Close-up of latte art in cool-toned lighting, different cup style, slightly different color grading"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    valid_verdicts = ["pass", "warn", "fail"]
    checks = [
        ("valid JSON", data is not None),
        ("has colorConsistency", data is not None and data.get("colorConsistency") in valid_verdicts),
        ("has subjectConsistency", data is not None and data.get("subjectConsistency") in valid_verdicts),
        ("has lightingConsistency", data is not None and data.get("lightingConsistency") in valid_verdicts),
        ("has styleConsistency", data is not None and data.get("styleConsistency") in valid_verdicts),
    ]
    return score_checks(checks), checks


# 20. consistency-scoring (video quality)
def eval_consistency_video_quality():
    prompt = """<role>You are a video quality assessor for AI-generated content.</role>

<task>Assess the quality of a described AI-generated video clip across 5 dimensions.</task>

<rules>
Return valid JSON:
{ "motionQuality": "pass|warn|fail", "faceQuality": "pass|warn|fail", "textQuality": "pass|warn|fail", "artifactLevel": "pass|warn|fail", "overallQuality": "pass|warn|fail", "notes": "string" }
</rules>

Video description: A 5-second AI-generated clip showing a barista pouring latte art. The motion is smooth but there's a slight jitter in the hand movement at 2.3s. The face is partially visible and well-rendered. No text overlays. Minor compression artifacts in the steam effect."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    valid_verdicts = ["pass", "warn", "fail"]
    checks = [
        ("valid JSON", data is not None),
        ("has motionQuality", data is not None and data.get("motionQuality") in valid_verdicts),
        ("has faceQuality", data is not None and data.get("faceQuality") in valid_verdicts),
        ("has textQuality", data is not None and data.get("textQuality") in valid_verdicts),
        ("has artifactLevel", data is not None and data.get("artifactLevel") in valid_verdicts),
        ("has overallQuality", data is not None and data.get("overallQuality") in valid_verdicts),
    ]
    return score_checks(checks), checks


# ============================================================
# EDITRON SERVICES (21-31)
# ============================================================

# 21. unified-edit-intelligence (creative intent)
def eval_unified_edit_intelligence():
    prompt = """<role>You are a professional video editor making creative editing decisions.</role>

<task>Generate creative intent decisions for each scene in a 30-second coffee ad. For each scene, decide the editing approach.</task>

<rules>
Return valid JSON:
{ "sceneIntents": [{ "sceneIndex": 0, "decisiveMoment": "the key visual moment", "zoomIntent": "push_in|pull_out|static|none", "pacingIntent": "fast|medium|slow", "transitionIn": "cut|dissolve|wipe|fade", "transitionOut": "cut|dissolve|wipe|fade", "reasoning": "why this approach" }] }
</rules>

<input_data>
Scene 0: Close-up espresso pour (5s), mood=luxurious
Scene 1: Barista grinding beans (8s), mood=energetic
Scene 2: Customer enjoying coffee (7s), mood=warm
Scene 3: Logo reveal (5s), mood=confident
</input_data>"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has sceneIntents array", data is not None and isinstance(data.get("sceneIntents"), list)),
        ("sceneIntents non-empty", data is not None and len(data.get("sceneIntents",[])) > 0),
    ]
    if data and isinstance(data.get("sceneIntents"), list):
        for si in data["sceneIntents"][:3]:
            checks.append((f"scene {si.get('sceneIndex','?')} has decisiveMoment", "decisiveMoment" in si))
            checks.append((f"scene {si.get('sceneIndex','?')} has zoomIntent", "zoomIntent" in si))
            checks.append((f"scene {si.get('sceneIndex','?')} has reasoning", "reasoning" in si))
    return score_checks(checks), checks


# 22. style-transfer EDIT_DNA
def eval_style_transfer_edit_dna():
    prompt = """<role>You are an expert video editor analyzing editing style DNA.</role>

<task>Analyze this editing description and extract a 7-dimension EditDNA profile.</task>

<rules>
Return valid JSON with these 7 dimensions:
{ "pacingSignature": { "averageShotDuration": 2.5, "rhythmPattern": "string" }, "transitionVocabulary": { "preferred": ["cut", "dissolve"], "frequency": "high|medium|low" }, "colorGradeProfile": { "temperature": "warm|cool|neutral", "contrast": "high|medium|low", "saturation": "high|medium|low" }, "motionPhilosophy": { "cameraMovement": "static|handheld|smooth", "zoomUsage": "frequent|occasional|rare" }, "audioEditingStyle": { "musicRole": "dominant|supportive|ambient", "sfxDensity": "heavy|moderate|minimal" }, "graphicDensity": { "textOverlays": "heavy|moderate|minimal", "lowerThirds": true }, "narrativeStructure": { "hookStyle": "question|statement|visual", "ctaPlacement": "end|throughout|none" } }
</rules>

Editing description: Fast-paced Instagram Reel style with quick cuts every 2-3 seconds, warm color grading, frequent zoom punches on product shots, upbeat background music, minimal text overlays, strong opening hook with a visual surprise."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    dims = ["pacingSignature", "transitionVocabulary", "colorGradeProfile", "motionPhilosophy", "audioEditingStyle", "graphicDensity", "narrativeStructure"]
    checks = [
        ("valid JSON", data is not None),
    ]
    for d in dims:
        checks.append((f"has {d}", data is not None and d in data))
    return score_checks(checks), checks


# 23. reference-content-extractor COMBINED
def eval_reference_content_extractor():
    prompt = """<role>You are a content analysis expert extracting both style DNA and content map from reference material.</role>

<task>Analyze the reference content and return editDNA (editing style profile) + contentMap (what visual content appears).</task>

<rules>
Return valid JSON:
{ "editDNA": { "pacing": "fast|medium|slow", "colorGrade": "warm|cool|neutral", "transitionStyle": "cuts|dissolves|mixed", "graphicDensity": "heavy|moderate|minimal" }, "contentMap": { "scenes": [{ "timestamp": "0:00", "description": "what happens", "visualElements": ["string"] }], "keyMoments": ["string"] } }
</rules>

Reference content: A 30-second Nike ad with quick cuts, desaturated color grading, dynamic camera movement, athlete close-ups, slow-motion product shots, bold text overlays, and an emotional soundtrack building to a crescendo."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has editDNA", data is not None and isinstance(data.get("editDNA"), dict)),
        ("has contentMap", data is not None and isinstance(data.get("contentMap"), dict)),
    ]
    if data and isinstance(data.get("editDNA"), dict):
        dna = data["editDNA"]
        checks.append(("editDNA has pacing", "pacing" in dna))
        checks.append(("editDNA has colorGrade", "colorGrade" in dna))
    if data and isinstance(data.get("contentMap"), dict):
        cm = data["contentMap"]
        checks.append(("contentMap has scenes", isinstance(cm.get("scenes"), list)))
    return score_checks(checks), checks


# 24. video-understanding
def eval_video_understanding():
    prompt = """<role>You are a professional video editor watching raw footage for the first time.</role>

<task>Understand the VISUAL SETUP of this 30s footage. Do NOT list scenes or timestamps.</task>

<rules>
RULE 1 - Describe what is STABLE across the footage.
RULE 2 - Return ONLY the JSON object.
</rules>

<output_format>
{ "contentType": "tutorial|vlog|ad|interview|product-demo|corporate|testimonial", "platform": "youtube|instagram|tiktok|linkedin|general", "visualSetup": { "environment": "indoor-studio|indoor-casual|outdoor|mixed", "subjectCount": 1, "hasFace": true, "dominantShotScale": "close-up|medium|wide|mix", "availableShotTypes": ["medium-shot"], "productionQuality": "professional|prosumer|casual|low", "hasBRoll": false, "visualComplexity": 0.3 }, "briefSummary": "2-3 sentence summary" }
</output_format>

Footage description: 30-second clip of a barista in a well-lit coffee shop making espresso. Shot on a mirrorless camera with shallow depth of field. Single subject, medium to close-up shots. Professional lighting. Clean modern interior with exposed brick walls."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has contentType", data is not None and isinstance(data.get("contentType"), str)),
        ("has visualSetup", data is not None and isinstance(data.get("visualSetup"), dict)),
    ]
    if data and isinstance(data.get("visualSetup"), dict):
        vs = data["visualSetup"]
        checks.append(("visualSetup has environment", "environment" in vs))
        checks.append(("visualSetup has subjectCount", "subjectCount" in vs))
        checks.append(("visualSetup has hasFace", "hasFace" in vs))
        checks.append(("visualSetup has productionQuality", "productionQuality" in vs))
    return score_checks(checks), checks


# 25. motion-graphics slot filler
def eval_motion_graphics_slot_filler():
    prompt = """<role>You are a motion graphics designer filling template slots for video overlays.</role>

<task>Fill the template slots with appropriate content for a coffee shop ad.</task>

<rules>
Return valid JSON filling each slot:
{ "headline": "string (max 6 words)", "subheadline": "string (max 12 words)", "cta_text": "string (max 4 words)", "accent_color": "#hex", "animation_style": "fade|slide|bounce|scale" }
</rules>

Template: Lower-third product card
Context: Introducing Velvet Brew's signature lavender oat milk latte, $6.50"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has headline", data is not None and isinstance(data.get("headline"), str)),
        ("headline max 6 words", data is not None and len(data.get("headline","").split()) <= 8),
        ("has subheadline", data is not None and isinstance(data.get("subheadline"), str)),
        ("has cta_text", data is not None and isinstance(data.get("cta_text"), str)),
        ("has accent_color", data is not None and isinstance(data.get("accent_color"), str)),
        ("has animation_style", data is not None and data.get("animation_style") in ["fade","slide","bounce","scale","pop","wipe","zoom"]),
    ]
    return score_checks(checks), checks


# 26. five-track shot detection
def eval_five_track_shot_detection():
    prompt = """<role>You are a video analysis engine detecting shot boundaries in footage.</role>

<task>Analyze the scene descriptions and identify distinct shot boundaries.</task>

<rules>
Return JSON array of shot segments:
[{ "startFrame": 0, "endFrame": 150, "shotType": "close-up|medium|wide", "description": "what happens" }]
At 30fps.
</rules>

Footage (30fps, 900 frames total = 30 seconds):
0-150 (0-5s): Close-up of espresso machine with steam
150-390 (5-13s): Medium shot of barista grinding beans
390-600 (13-20s): Wide shot of coffee shop interior
600-750 (20-25s): Close-up of latte art being poured
750-900 (25-30s): Medium shot of customer smiling"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("is array", isinstance(data, list)),
        ("has shot entries", isinstance(data, list) and len(data) > 0),
    ]
    if isinstance(data, list):
        for shot in data[:3]:
            checks.append(("shot has startFrame", "startFrame" in shot))
            checks.append(("shot has endFrame", "endFrame" in shot))
    return score_checks(checks), checks


# 27. five-track comprehensive
def eval_five_track_comprehensive():
    prompt = """<role>You are a comprehensive video analysis engine.</role>

<task>Analyze the described footage and return motion segments, keyframes, and subjects.</task>

<rules>
Return valid JSON:
{ "motionSegments": [{ "startFrame": 0, "endFrame": 100, "motionType": "static|pan|tilt|zoom|handheld", "intensity": 0.3 }], "keyframes": [{ "frame": 50, "description": "what makes this a key moment" }], "subjects": [{ "label": "string", "category": "person|product|object", "firstAppearanceFrame": 0 }] }
</rules>

Footage description (30fps, 900 frames):
A 30-second coffee shop ad. Starts with static close-up of espresso machine (0-5s), then handheld medium shot following barista (5-13s), tripod wide shot of interior (13-20s), slow zoom on latte art (20-25s), static medium of customer (25-30s)."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has motionSegments", data is not None and isinstance(data.get("motionSegments"), list)),
        ("has keyframes", data is not None and isinstance(data.get("keyframes"), list)),
        ("has subjects", data is not None and isinstance(data.get("subjects"), list)),
    ]
    if data and isinstance(data.get("motionSegments"), list) and len(data["motionSegments"]) > 0:
        ms = data["motionSegments"][0]
        checks.append(("motionSegment has startFrame", "startFrame" in ms))
        checks.append(("motionSegment has motionType", "motionType" in ms))
    return score_checks(checks), checks


# 28. five-track motion fallback
def eval_five_track_motion_fallback():
    prompt = """<role>You are a motion analysis engine for video content.</role>

<task>Analyze the described footage and return camera motion types and motion peaks.</task>

<rules>
Return valid JSON:
{ "cameraMotionTypes": [{ "type": "static|pan|tilt|zoom|handheld|tracking|dolly", "startFrame": 0, "endFrame": 100 }], "motionPeaks": [{ "frame": 50, "intensity": 0.8, "type": "camera|subject|both" }] }
</rules>

Footage (30fps): The camera starts static on the espresso machine (0-5s), then smoothly pans right to follow the barista (5-10s), holds static on a wide shot (10-15s), then slow zoom in on latte art (15-20s)."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has cameraMotionTypes", data is not None and isinstance(data.get("cameraMotionTypes"), list)),
        ("has motionPeaks", data is not None and isinstance(data.get("motionPeaks"), list)),
    ]
    if data and isinstance(data.get("cameraMotionTypes"), list) and len(data["cameraMotionTypes"]) > 0:
        cm = data["cameraMotionTypes"][0]
        checks.append(("cameraMotion has type", "type" in cm))
        checks.append(("cameraMotion has startFrame", "startFrame" in cm))
    if data and isinstance(data.get("motionPeaks"), list) and len(data["motionPeaks"]) > 0:
        mp = data["motionPeaks"][0]
        checks.append(("motionPeak has frame", "frame" in mp))
        checks.append(("motionPeak has intensity", "intensity" in mp))
    return score_checks(checks), checks


# 29. five-track transcript classifier
def eval_five_track_transcript_classifier():
    prompt = """<role>You are a content classifier analyzing video transcripts.</role>

<task>Classify the content type based on this transcript excerpt.</task>

<rules>
Return valid JSON:
{ "primaryCategory": "tutorial|vlog|ad|interview|product-demo|educational|entertainment|news|documentary", "secondaryCategory": "string or null", "confidence": 0.9, "indicators": ["what clues led to this classification"] }
</rules>

Transcript: "Hey everyone, today I'm going to show you how to make the perfect latte at home. First, you'll need freshly ground beans - I recommend a medium roast. Then heat your milk to about 150 degrees. Now watch carefully as I demonstrate the frothing technique..."
"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has primaryCategory", data is not None and isinstance(data.get("primaryCategory"), str)),
        ("has confidence", data is not None and isinstance(data.get("confidence"), (int, float))),
        ("has indicators", data is not None and isinstance(data.get("indicators"), list)),
    ]
    return score_checks(checks), checks


# 30. media analysis audio
def eval_media_analysis_audio():
    prompt = """<role>You are an audio analysis engine for video production.</role>

<task>Analyze the described audio track and identify silences and filler words.</task>

<rules>
Return valid JSON:
{ "silences": [{ "startMs": 0, "endMs": 500, "duration": 500 }], "fillers": [{ "word": "um", "startMs": 1200, "endMs": 1400, "confidence": 0.9 }], "overallNoiseLevel": "clean|moderate|noisy", "speechPercentage": 0.75 }
</rules>

Audio description: A 30-second voice recording of someone describing a coffee recipe. Clean audio with minor background cafe noise. Speaker says "um" at 1.2s and 8.5s. There's a 1.5s silence at 4.0s between sentences. Filler "you know" at 15.3s. Speech covers about 80% of the audio."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has silences array", data is not None and isinstance(data.get("silences"), list)),
        ("has fillers array", data is not None and isinstance(data.get("fillers"), list)),
    ]
    if data and isinstance(data.get("silences"), list) and len(data["silences"]) > 0:
        s = data["silences"][0]
        checks.append(("silence has startMs", "startMs" in s))
        checks.append(("silence has endMs", "endMs" in s))
    if data and isinstance(data.get("fillers"), list) and len(data["fillers"]) > 0:
        f = data["fillers"][0]
        checks.append(("filler has word", "word" in f))
        checks.append(("filler has startMs", "startMs" in f))
    return score_checks(checks), checks


# 31. media analysis video
def eval_media_analysis_video():
    prompt = """<role>You are a video analysis engine detecting scene changes and dead ranges.</role>

<task>Analyze the described video content and identify scene changes and dead ranges (segments with no visual interest).</task>

<rules>
Return valid JSON:
{ "sceneChanges": [{ "frame": 150, "type": "cut|dissolve|fade", "confidence": 0.95 }], "deadRanges": [{ "startFrame": 300, "endFrame": 350, "reason": "static shot with no motion or subject" }] }
</rules>

Video description (30fps): 0-5s close-up of espresso (static, interesting). 5s sharp cut to barista grinding (motion). 13s dissolve to wide shot. 13-15s: dead period - empty counter with no subject. 15s cut to latte art. 20s: another dead moment - just wall texture for 1 second. 25s cut to customer reaction."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has sceneChanges array", data is not None and isinstance(data.get("sceneChanges"), list)),
        ("has deadRanges array", data is not None and isinstance(data.get("deadRanges"), list)),
    ]
    if data and isinstance(data.get("sceneChanges"), list) and len(data["sceneChanges"]) > 0:
        sc = data["sceneChanges"][0]
        checks.append(("sceneChange has frame", "frame" in sc))
        checks.append(("sceneChange has type", "type" in sc))
    if data and isinstance(data.get("deadRanges"), list) and len(data["deadRanges"]) > 0:
        dr = data["deadRanges"][0]
        checks.append(("deadRange has startFrame", "startFrame" in dr))
        checks.append(("deadRange has reason", "reason" in dr))
    return score_checks(checks), checks


# ============================================================
# EDITRON TOOLS + CHAT (32-36)
# ============================================================

# 32. agent-graph chat system
def eval_agent_graph_chat():
    prompt = """<role>You are an AI video editing assistant with access to editing tools.</role>

<task>The user wants to add a text overlay. Respond with the appropriate tool call.</task>

<rules>
When the user requests an edit action, respond with a tool call in this format:
{ "tool": "add_overlay", "params": { "text": "the text content", "position": "top|center|bottom", "style": "minimal|bold|animated" } }
If it's a question, respond in plain text.
</rules>

User: Add a text overlay saying "hello" at the bottom of the screen"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("produces response", len(text) > 5),
        ("contains tool call or overlay mention", data is not None or "overlay" in text.lower() or "add_overlay" in text.lower() or "tool" in text.lower()),
    ]
    if data:
        checks.append(("has tool field", "tool" in data))
        checks.append(("tool is add_overlay", data.get("tool") == "add_overlay" or "overlay" in str(data.get("tool",""))))
        checks.append(("has params", "params" in data or "parameters" in data))
    else:
        checks.append(("mentions adding overlay", "overlay" in text.lower() or "text" in text.lower()))
    return score_checks(checks), checks


# 33. tools.ts motion graphics bg
def eval_tools_motion_graphics_bg():
    prompt = """<role>You are a world-class motion graphics designer creating aesthetic video backgrounds.</role>

<task>Generate HTML code for an animated background. The HTML must be self-contained with inline CSS and JavaScript. No external resources (no CDN links, no external fonts, no images).</task>

<rules>
- Pure HTML/CSS/JS only
- No external resources
- Must be visually appealing and animated
- Include proper viewport meta tag
- Background should loop infinitely
</rules>

Description: Create a subtle animated gradient background that shifts between deep purple and midnight blue, with floating particle effects."""
    text = call_gemini(prompt, max_tokens=6000)
    lt = text.lower()
    checks = [
        ("non-empty response", len(text) > 50),
        ("contains HTML", "<html" in lt or "<!doctype" in lt or "<div" in lt),
        ("has style/CSS", "<style" in lt or "style=" in lt),
        ("has animation", "animation" in lt or "keyframe" in lt or "transition" in lt or "requestanimationframe" in lt or "setinterval" in lt or "animate" in lt),
        ("no external resources", "cdn" not in lt or "googleapis" not in lt),
    ]
    return score_checks(checks), checks


# 34. tools.ts sticker
def eval_tools_sticker():
    prompt = """<role>You are a creative motion graphics designer creating animated sticker elements for video overlays.</role>

<task>Generate HTML code for an animated sticker/emoji overlay. Self-contained HTML with inline CSS and JS. No external resources.</task>

<rules>
- Pure HTML/CSS/JS
- No external resources
- Must have animation (bounce, pulse, rotate, etc.)
- Transparent background (the sticker floats over video)
- Keep it simple and performant
</rules>

Description: An animated coffee cup emoji that gently bounces and has steam rising from it."""
    text = call_gemini(prompt, max_tokens=6000)
    lt = text.lower()
    checks = [
        ("non-empty response", len(text) > 50),
        ("contains HTML", "<html" in lt or "<div" in lt or "<svg" in lt),
        ("has animation", "animation" in lt or "keyframe" in lt or "transform" in lt or "animate" in lt or "setinterval" in lt),
    ]
    return score_checks(checks), checks


# 35. tools.ts placement planner
def eval_tools_placement_planner():
    prompt = """<role>You are a video overlay placement planner.</role>

<task>Suggest placement positions for overlays on a 1920x1080 video frame.</task>

<rules>
Return JSON array of placement suggestions:
[{ "name": "string", "x": 100, "y": 100, "width": 400, "height": 200, "alignment": "top-left|top-center|top-right|center|bottom-left|bottom-center|bottom-right", "purpose": "why this position works" }]
Avoid placing in the center of the frame where the main subject typically is.
</rules>

Context: A coffee shop ad with a barista as the main subject in the center. Need to place: 1) Product name text, 2) Price tag, 3) Logo watermark"""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("is array", isinstance(data, list)),
        ("has placement entries", isinstance(data, list) and len(data) > 0),
    ]
    if isinstance(data, list):
        for p in data[:3]:
            checks.append(("placement has name", "name" in p))
            checks.append(("placement has x/y", "x" in p and "y" in p))
            checks.append(("placement has purpose or alignment", "purpose" in p or "alignment" in p))
    return score_checks(checks), checks


# 36. html-generator-utils kinetic typography
def eval_kinetic_typography():
    prompt = """<role>You are a kinetic typography designer for video.</role>

<task>Generate HTML for animated text that can be overlaid on video. Must include data-attributes for timing synchronization.</task>

<rules>
- Self-contained HTML with inline CSS/JS
- Include data-start-ms and data-end-ms attributes on text elements for video sync
- Animated text entrance and exit
- No external resources
</rules>

Text to animate: "Taste the Craft"
Duration: 3000ms (data-start-ms="2000" data-end-ms="5000")"""
    text = call_gemini(prompt, max_tokens=6000)
    lt = text.lower()
    checks = [
        ("non-empty response", len(text) > 50),
        ("contains HTML", "<html" in lt or "<div" in lt or "<span" in lt or "<p" in lt),
        ("has data attributes", "data-" in lt),
        ("has animation", "animation" in lt or "keyframe" in lt or "transition" in lt or "animate" in lt or "transform" in lt or "setinterval" in lt),
    ]
    return score_checks(checks), checks


# ============================================================
# CLICKATRON (37-39)
# ============================================================

# 37. enhance-prompt imageGeneration
def eval_enhance_prompt_image_gen():
    prompt = """<role>You are an AI image generation prompt enhancer.</role>

<task>Take the user's basic image description and enhance it into a detailed, high-quality prompt for AI image generation. Add details about lighting, composition, style, mood, and technical aspects.</task>

<rules>
- Output ONLY the enhanced prompt string, nothing else
- Make it more detailed and vivid than the input
- Add photography/art direction terms
- Keep it under 200 words
</rules>

Input prompt: A cup of coffee on a table"""
    text = call_gemini(prompt)
    input_words = len("A cup of coffee on a table".split())
    output_words = len(text.split())
    checks = [
        ("non-empty response", len(text) > 20),
        ("more detailed than input", output_words > input_words),
        ("enhanced with details", output_words > 15),
        ("under 200 words", output_words < 200),
    ]
    return score_checks(checks), checks


# 38. enhance-prompt imageEditing
def eval_enhance_prompt_image_edit():
    prompt = """<role>You are an AI image editing prompt enhancer.</role>

<task>Take the user's editing instruction and rewrite it as a clear, specific end-result description suitable for AI image editing models.</task>

<rules>
- Describe the DESIRED END RESULT, not the process
- Be specific about what the final image should look like
- Output ONLY the enhanced prompt string
</rules>

Input instruction: Make the coffee cup look more premium"""
    text = call_gemini(prompt)
    checks = [
        ("non-empty response", len(text) > 10),
        ("describes end result", len(text) > 20),
        ("is a clear description", len(text.split()) > 5),
    ]
    return score_checks(checks), checks


# 39. sketch-to-edit
def eval_sketch_to_edit():
    prompt = """<role>You are processing a sketch annotation for image editing.</role>

<task>The user drew annotations on an image to indicate edits. Preserve the instruction about what the annotations mean and describe the intended edit clearly.</task>

<rules>
- Preserve the instruction about annotations
- Be specific about what should change in the marked areas
- Output a clear editing instruction
</rules>

User instruction: I circled the cup and drew an arrow pointing up -- make it larger
Annotation areas: Red circle around cup (center of image), red arrow pointing up from cup"""
    text = call_gemini(prompt)
    checks = [
        ("non-empty response", len(text) > 10),
        ("preserves annotation context", "circle" in text.lower() or "arrow" in text.lower() or "annotation" in text.lower() or "marked" in text.lower()),
        ("mentions the edit action", "larger" in text.lower() or "bigger" in text.lower() or "enlarge" in text.lower() or "scale" in text.lower() or "size" in text.lower()),
    ]
    return score_checks(checks), checks


# ============================================================
# ALYZITRON (40-41)
# ============================================================

# 40. vertexAiService analysis
def eval_alyzitron_analysis():
    prompt = """<role>You are a video content analysis engine providing structured analysis.</role>

<task>Analyze the described video and return structured JSON with overview, key moments, and quality scores.</task>

<rules>
Return valid JSON:
{ "overview": { "title": "string", "duration": "30s", "contentType": "ad", "summary": "string" }, "key_moments": [{ "timestamp": "0:05", "description": "string", "significance": "high|medium|low" }], "quality_scores": { "production": 8, "storytelling": 7, "engagement": 9, "audio": 8 } }
Quality scores are 1-10.
</rules>

Video: A 30-second coffee shop ad featuring close-up product shots, barista action, and customer testimonials. Professional lighting, smooth camera movement, upbeat background music. Clean editing with 2-3 second cuts."""
    text = call_gemini(prompt)
    data = try_parse_json(text)
    checks = [
        ("valid JSON", data is not None),
        ("has overview", data is not None and isinstance(data.get("overview"), dict)),
        ("has key_moments", data is not None and isinstance(data.get("key_moments"), list)),
        ("has quality_scores", data is not None and isinstance(data.get("quality_scores"), dict)),
    ]
    if data and isinstance(data.get("quality_scores"), dict):
        qs = data["quality_scores"]
        for k in ["production", "storytelling", "engagement", "audio"]:
            val = qs.get(k)
            checks.append((f"quality_score {k} is 1-10", isinstance(val, (int, float)) and 1 <= val <= 10))
    return score_checks(checks), checks


# 41. contextManager summary
def eval_context_manager_summary():
    prompt = """<role>You are a conversation summarizer for a video analysis chat interface.</role>

<task>Summarize the conversation below into a concise summary that preserves key decisions and context.</task>

<rules>
- Keep it under 150 words
- Focus on decisions made, not pleasantries
- Include any specific numbers, settings, or parameters discussed
- Output plain text summary only
</rules>

Conversation:
User: Can you analyze my coffee shop ad?
Assistant: I've analyzed your 30-second ad. The production quality scores 8/10 with strong visual composition. Key findings: good pacing with 2-3s cuts, warm color grading works well, but the CTA at the end feels rushed.
User: How can I improve the CTA?
Assistant: I recommend extending the CTA from 3s to 5s, adding a lower-third with your URL, and using a slower dissolve transition instead of a hard cut.
User: Let's go with 4 seconds and keep the hard cut but add the lower third."""
    text = call_gemini(prompt, max_tokens=200)
    word_count = len(text.split())
    checks = [
        ("non-empty response", len(text) > 20),
        ("concise summary", word_count < 150),
        ("captures key details", "cta" in text.lower() or "call" in text.lower() or "4 second" in text.lower() or "lower" in text.lower()),
        ("is a summary, not a conversation", "User:" not in text),
    ]
    return score_checks(checks), checks


# ============================================================
# MAIN
# ============================================================

ALREADY_SCORED = {
    "scene_parser": 0.956,
    "transcript_editor": 1.000,
    "editorial_intent": 0.867,
    "holistic_editor": 1.000,
    "intent_classifier": 1.000,
    "scope_detector": 1.000,
    "tf_intent": 1.000,
    "argument_protector": 1.000,
}

EVAL_REGISTRY = [
    # ThinkForge agents
    ("ideas_agent", eval_ideas_agent),
    ("architect_agent", eval_architect_agent),
    ("discovery_agent", eval_discovery_agent),
    ("ingestor_agent", eval_ingestor_agent),
    ("stylist_agent", eval_stylist_agent),
    ("supervisor_agent", eval_supervisor_agent),
    ("thinking_agent", eval_thinking_agent),
    ("chat_agent", eval_chat_agent),
    ("research_agent", eval_research_agent),
    ("script_coherence_agent", eval_script_coherence_agent),
    ("script_refinement_agent", eval_script_refinement_agent),
    ("script_section_agent", eval_script_section_agent),
    ("script_author_agent", eval_script_author_agent),
    ("post_mortem_agent", eval_post_mortem_agent),
    ("url_brief_agent", eval_url_brief_agent),
    # Pipeline prompts
    ("subject_extractor", eval_subject_extractor),
    ("video_prompt_master", eval_video_prompt_master),
    ("reference_image_service", eval_reference_image_service),
    ("consistency_pairwise", eval_consistency_pairwise),
    ("consistency_video_quality", eval_consistency_video_quality),
    # Editron services
    ("unified_edit_intelligence", eval_unified_edit_intelligence),
    ("style_transfer_edit_dna", eval_style_transfer_edit_dna),
    ("reference_content_extractor", eval_reference_content_extractor),
    ("video_understanding", eval_video_understanding),
    ("motion_graphics_slot_filler", eval_motion_graphics_slot_filler),
    ("five_track_shot_detection", eval_five_track_shot_detection),
    ("five_track_comprehensive", eval_five_track_comprehensive),
    ("five_track_motion_fallback", eval_five_track_motion_fallback),
    ("five_track_transcript_classifier", eval_five_track_transcript_classifier),
    ("media_analysis_audio", eval_media_analysis_audio),
    ("media_analysis_video", eval_media_analysis_video),
    # Editron tools + chat
    ("agent_graph_chat", eval_agent_graph_chat),
    ("tools_motion_graphics_bg", eval_tools_motion_graphics_bg),
    ("tools_sticker", eval_tools_sticker),
    ("tools_placement_planner", eval_tools_placement_planner),
    ("kinetic_typography", eval_kinetic_typography),
    # Clickatron
    ("enhance_prompt_image_gen", eval_enhance_prompt_image_gen),
    ("enhance_prompt_image_edit", eval_enhance_prompt_image_edit),
    ("sketch_to_edit", eval_sketch_to_edit),
    # Alyzitron
    ("alyzitron_analysis", eval_alyzitron_analysis),
    ("context_manager_summary", eval_context_manager_summary),
]


def main():
    print("=" * 60)
    print("  INSTURIX COMPREHENSIVE LLM PROMPT EVAL")
    print(f"  Model: gemini-2.5-flash | Prompts: {len(EVAL_REGISTRY)}")
    print("=" * 60)

    start = time.time()

    for name, fn in EVAL_REGISTRY:
        run_eval(name, fn)
        time.sleep(1.5)  # rate limit buffer

    elapsed = time.time() - start

    # Combine with already-scored
    all_results = {}
    for k, v in ALREADY_SCORED.items():
        all_results[k] = {"score": v, "status": "previously_scored"}
    for k, v in RESULTS.items():
        all_results[k] = v

    # Save to file
    out_path = os.path.join(os.path.dirname(__file__), "eval_all_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        # Serialize: convert tuples in details to lists
        serializable = {}
        for k, v in all_results.items():
            entry = dict(v)
            if isinstance(entry.get("details"), list):
                entry["details"] = [[d[0], d[1]] for d in entry["details"]]
            serializable[k] = entry
        json.dump(serializable, f, indent=2, ensure_ascii=True)

    # Print summary
    print("\n\n" + "=" * 60)
    print("  FINAL SCOREBOARD")
    print("=" * 60)

    scores = []
    for name, data in sorted(all_results.items()):
        sc = data.get("score", 0.0) if isinstance(data, dict) else data
        status = data.get("status", "ok") if isinstance(data, dict) else "ok"
        tag = ""
        if status == "previously_scored":
            tag = " (prev)"
        elif status == "error":
            tag = " (ERR)"
        print(f"  {name:<40} {sc:.3f}{tag}")
        scores.append(sc)

    avg = sum(scores) / len(scores) if scores else 0
    new_scores = [v["score"] for v in RESULTS.values() if v.get("status") == "ok"]
    new_avg = sum(new_scores) / len(new_scores) if new_scores else 0

    print(f"\n  {'OVERALL AVERAGE':<40} {avg:.3f}")
    print(f"  {'NEW EVALS AVERAGE':<40} {new_avg:.3f}")
    print(f"  {'Total prompts scored':<40} {len(all_results)}")
    print(f"  {'New evals run':<40} {len(RESULTS)}")
    print(f"  {'Errors':<40} {sum(1 for v in RESULTS.values() if v.get('status')=='error')}")
    print(f"  {'Time':<40} {elapsed:.1f}s")
    print(f"\n  Results saved to: {out_path}")


if __name__ == "__main__":
    main()
