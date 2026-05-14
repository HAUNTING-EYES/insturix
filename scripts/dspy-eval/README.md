# DSPy Evaluation Framework — Insturix Scene Parser

Offline prompt optimization for the LLM scene parser and other pipeline prompts.
DSPy MIPROv2 optimizes prompt wording against ground truth, then optimized prompts
are hardcoded into TypeScript. Zero runtime dependency on DSPy.

## Setup

```bash
cd scripts/dspy-eval
python -m venv .venv

# Windows
.venv\Scripts\activate
# Linux/Mac
source .venv/bin/activate

pip install -r requirements.txt
```

## Environment

Create a `.env` file in the project root (or `scripts/dspy-eval/`) with:

```
GEMINI_API_KEY=your-key-here
```

The framework searches for `.env` in: `scripts/dspy-eval/`, project root, and
parent directories.

## Usage

### 1. Evaluate current prompt (multi-seed)

```bash
# Single seed
python eval_scene_parser.py --seed=1

# Multi-seed (default: seeds 1-10)
python eval_scene_parser.py

# Custom seed range
python eval_scene_parser.py --seeds=1,2,3,4,5
```

### 2. Build ground truth from parser output

```bash
python build_ground_truth.py test-scripts/mcdonalds_brand_ad.txt
```

This runs the parser, then walks you through verifying each scene interactively.
Saves verified output as `test-scripts/mcdonalds_brand_ad_ground_truth.json`.

### 3. Optimize prompt with DSPy MIPROv2

```bash
python optimize_prompt.py
```

Outputs optimized prompt text to `optimized/` and prints it for hardcoding into
`lib/pipeline/llm-scene-parser.ts`.

### 4. Evaluate any prompt (generic harness)

```bash
python eval_generic.py \
  --prompt-template=path/to/prompt.txt \
  --test-data=path/to/test_data.json \
  --scoring-module=my_scoring \
  --seeds=1,2,3
```

## Scoring Dimensions

The scene parser is scored on 6 dimensions (0.0-1.0 each):

| Dimension | What it measures |
|-----------|-----------------|
| scene_count | Expected vs actual scene count (within tolerance) |
| narration_quality | Clean extraction, no visual contamination |
| visual_quality | One subject, one moment, no banned words |
| subshot_correctness | Mode A vs Mode B decision correct |
| onscreen_text | Verbatim match against script text |
| transition_mapping | Correct transition IDs |

Composite score = weighted mean. Weights configurable in `eval_scene_parser.py`.

## Directory Structure

```
scripts/dspy-eval/
  requirements.txt          # Python dependencies
  eval_scene_parser.py      # Scene parser evaluation harness
  eval_generic.py           # Generic prompt evaluation template
  build_ground_truth.py     # Interactive ground truth builder
  optimize_prompt.py        # DSPy MIPROv2 optimizer
  test-scripts/             # Test scripts + ground truth
    mcdonalds_brand_ad.txt
    mcdonalds_brand_ad_ground_truth.json
    ...
  optimized/                # DSPy optimizer output
```
