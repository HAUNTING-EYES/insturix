"""
Disfluency Training Data Preparation — Gemma 4 Word-Level Tagger

Downloads and formats real disfluency datasets for fine-tuning a
word-level fluent/disfluent tagger:

1. DisfluencySpeech (HuggingFace, Apache 2.0) — 5K utterances with 4-tier cleanup
2. Disfl-QA (HuggingFace, CC BY 4.0) — 12K paired clean/disfluent questions
3. Switchboard re-annotated (GitHub, free) — word-level reparandum/repair labels

Plus synthetic generation for video-editing-specific patterns (meta-commentary,
retake markers) that disfluency corpora don't cover.

Output: JSONL for QLoRA fine-tuning with Unsloth.
Format: word-level tagging — model receives disfluent text, outputs tagged version.

Usage:
  pip install datasets
  python prepare_disfluency_data.py --output disfluency_training.jsonl
"""

import json
import random
from pathlib import Path


# ─── Format: Word-Level Tagging ────────────────────────────────────
#
# Input:  "I th- I think the internet is great."
# Output: "<reparandum>I th-</reparandum> I think the internet is great."
#
# The model learns to wrap disfluent portions in <reparandum> tags.
# At inference, we extract the tagged regions and trim the overlay
# to exclude them.


def format_tagged_example(disfluent_text: str, clean_text: str) -> dict:
    """Create a training example from paired disfluent/clean text.

    Uses word-level diff to find which words in disfluent_text are NOT
    in clean_text, then wraps those in <reparandum> tags. Handles
    disfluencies at the start, middle, or end of the sentence.
    """
    import difflib

    disf_words = disfluent_text.split()
    clean_words = clean_text.split()

    matcher = difflib.SequenceMatcher(None,
        [w.lower().strip('.,!?"\'-') for w in disf_words],
        [w.lower().strip('.,!?"\'-') for w in clean_words],
    )

    tagged_parts = []
    reparandum_buf = []

    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op == 'equal':
            # Flush any accumulated reparandum
            if reparandum_buf:
                tagged_parts.append(f"<reparandum>{' '.join(reparandum_buf)}</reparandum>")
                reparandum_buf = []
            tagged_parts.extend(disf_words[i1:i2])
        elif op in ('delete', 'replace', 'insert'):
            # Words in disfluent but not in clean = reparandum
            if op != 'insert':
                reparandum_buf.extend(disf_words[i1:i2])

    # Flush final buffer
    if reparandum_buf:
        tagged_parts.append(f"<reparandum>{' '.join(reparandum_buf)}</reparandum>")

    tagged = ' '.join(tagged_parts) if tagged_parts else disfluent_text

    return {
        "messages": [
            {
                "role": "user",
                "content": (
                    "You are a speech disfluency detector. Tag the disfluent portions "
                    "(stutters, false starts, filler words, abandoned attempts) with "
                    "<reparandum></reparandum> tags. Keep everything else unchanged.\n\n"
                    f"Input: \"{disfluent_text}\""
                )
            },
            {
                "role": "assistant",
                "content": tagged
            }
        ]
    }


def try_download_disfluency_speech() -> list[dict]:
    """Download DisfluencySpeech from HuggingFace."""
    examples = []
    try:
        from datasets import load_dataset
        ds = load_dataset("amaai-lab/DisfluencySpeech", split="train")
        for item in ds:
            # transcript_a = with fillers/discourse markers
            # transcript_c = cleaned (false starts removed)
            full = item.get("transcript_a", "")
            clean = item.get("transcript_c", "")
            if full and clean and full != clean and len(full) > 10:
                examples.append(format_tagged_example(full, clean))
        print(f"  DisfluencySpeech: {len(examples)} examples")
    except Exception as e:
        print(f"  DisfluencySpeech: SKIPPED ({e})")
    return examples


def try_download_disfl_qa() -> list[dict]:
    """Download Disfl-QA from HuggingFace."""
    examples = []
    try:
        from datasets import load_dataset
        ds = load_dataset("google-research-datasets/disfl_qa", split="train")
        for item in ds:
            disfluent = item.get("disfluent question", "")
            original = item.get("original question", "")
            if disfluent and original and disfluent != original:
                examples.append(format_tagged_example(disfluent, original))
        print(f"  Disfl-QA: {len(examples)} examples")
    except Exception as e:
        print(f"  Disfl-QA: SKIPPED ({e})")
    return examples


def try_download_swda() -> list[dict]:
    """Download Switchboard Dialogue Acts for abandoned/self-talk labels."""
    examples = []
    try:
        from datasets import load_dataset
        ds = load_dataset("cgpotts/swda", split="train")
        for item in ds:
            act_tag = item.get("act_tag", "")
            text = item.get("text", "")
            if not text:
                continue
            # Map dialogue acts to KEEP/CUT
            # These are segment-level, not word-level, but useful for meta detection
            cut_tags = {"b", "bh", "%", "x", "h"}  # backchannel, abandoned, uninterpretable, hedge
            if act_tag in cut_tags and len(text.split()) > 2:
                examples.append({
                    "messages": [
                        {
                            "role": "user",
                            "content": (
                                "You are a speech disfluency detector. Tag the disfluent portions "
                                "with <reparandum></reparandum> tags.\n\n"
                                f"Input: \"{text}\""
                            )
                        },
                        {
                            "role": "assistant",
                            "content": f"<reparandum>{text}</reparandum>"
                        }
                    ]
                })
        print(f"  SwDA (abandoned/backchannel): {len(examples)} examples")
    except Exception as e:
        print(f"  SwDA: SKIPPED ({e})")
    return examples


# ─── Synthetic: Video-Editing-Specific Patterns ────────────────────

def generate_video_editing_synthetic(n: int = 2000) -> list[dict]:
    """Generate synthetic training data for patterns unique to video editing."""
    examples = []
    random.seed(42)

    # Category 1: Within-sentence stutters (word-level disfluency)
    stutter_pairs = [
        ("I th- I think the internet is great.", "I think the internet is great."),
        ("The the the main point is clear.", "The main point is clear."),
        ("So what I want to- what I want to say is important.", "So what I want to say is important."),
        ("But then they-- but then when they get home.", "But then when they get home."),
        ("'Cause they're pro- 'Cause they're probably right.", "'Cause they're probably right."),
        ("It's a, it's a kind of, it's a kind of power.", "It's a kind of power."),
        ("We all, we all know, we all know that this matters.", "We all know that this matters."),
        ("This person goes, this person goes on the internet.", "This person goes on the internet."),
        ("I'm, I've got no research to back this up.", "I've got no research to back this up."),
        ("And on- and honestly, I think this is important.", "And honestly, I think this is important."),
        ("The result is that good, the result is that fewer people.", "The result is that fewer people."),
        ("So it shouldn't be, so it shouldn't be a surprise.", "So it shouldn't be a surprise."),
        ("It's totally feeding, it's totally feeding the trolls.", "It's totally feeding the trolls."),
        ("Not because culture, not because culture tells them.", "Not because culture tells them."),
        ("People, people believe that the internet is hostile.", "People believe that the internet is hostile."),
        ("What we're looking at here, what we're looking at is bias.", "What we're looking at is bias."),
        ("I mean, I mean, you see in the comments.", "You see in the comments."),
        ("He doesn't want to, he doesn't want to express his beliefs.", "He doesn't want to express his beliefs."),
        ("In the phys- in the physical world, this human is invisible.", "In the physical world, this human is invisible."),
        ("You just- the reason you don't run into trolls.", "The reason you don't run into trolls."),
    ]

    # Category 2: Meta-commentary (entire segment is disfluent)
    meta_examples = [
        "Is the camera recording?",
        "Can you adjust the light?",
        "That was me editing a video.",
        "I'll put this at the beginning.",
        "Let me start over.",
        "I'm probably gonna put this in text descriptions.",
        "OK so this is the editing challenge.",
        "Three, two, one.",
        "I like it, that sounds good, OK I'm gonna use that.",
        "Nah, let me try again.",
        "That came out wrong.",
        "Wait, is this thing on?",
        "Sorry, one more time.",
        "OK back to the...",
        "The whole process of me making the video.",
    ]

    # Category 3: Content (should NOT be tagged)
    content_examples = [
        "The internet brings out the worst in people.",
        "I'm thinking anonymity doesn't bring out the worst in people.",
        "It just brings out the worst people.",
        "Imagine, if you will, a D-bag.",
        "He's racist and he's sexist.",
        "On average, he speaks to about point zero two human beings per day.",
        "What we're looking at in the comments is extreme selection bias.",
        "People don't want to comment because it seems hostile.",
        "Just imagine a hundred thousand people gather in a room.",
        "That's an algorithmic problem.",
        "Not because culture tells them to be good, but because they're people.",
        "Wikipedia. For Christ's sake!",
        "And the trolls are loving it.",
        "It's thrilling. It's not scary like real life.",
        "Because nobody likes them.",
    ]

    # Generate stutter examples
    for disfluent, clean in stutter_pairs:
        examples.append(format_tagged_example(disfluent, clean))

    # Generate variations of stutters
    words = ["think", "believe", "know", "want", "need", "see", "understand", "feel"]
    topics = ["internet", "technology", "education", "healthcare", "climate", "economy", "politics", "science", "culture", "media"]

    for _ in range(n // 3):
        word = random.choice(words)
        topic = random.choice(topics)
        patterns = [
            (f"I {word[:2]}- I {word} the {topic} is important.", f"I {word} the {topic} is important."),
            (f"The {topic}, the {topic} is changing everything.", f"The {topic} is changing everything."),
            (f"So the {topic} is- so the {topic} is really key.", f"So the {topic} is really key."),
            (f"But {topic}-- but {topic} matters here.", f"But {topic} matters here."),
            (f"I {word}, I {word} that {topic} is the future.", f"I {word} that {topic} is the future."),
        ]
        disfluent, clean = random.choice(patterns)
        examples.append(format_tagged_example(disfluent, clean))

    # Generate meta examples (entire text is reparandum)
    for meta in meta_examples:
        examples.append({
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "You are a speech disfluency detector. Tag the disfluent portions "
                        "with <reparandum></reparandum> tags.\n\n"
                        f"Input: \"{meta}\""
                    )
                },
                {
                    "role": "assistant",
                    "content": f"<reparandum>{meta}</reparandum>"
                }
            ]
        })

    # Generate content examples (nothing tagged)
    for content in content_examples:
        examples.append({
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "You are a speech disfluency detector. Tag the disfluent portions "
                        "with <reparandum></reparandum> tags.\n\n"
                        f"Input: \"{content}\""
                    )
                },
                {
                    "role": "assistant",
                    "content": content  # No tags — content is clean
                }
            ]
        })

    # Generate more content variations (important: model must NOT over-tag)
    for _ in range(n // 3):
        topic = random.choice(topics)
        templates = [
            f"The {topic} is changing how we live.",
            f"I think {topic} will define the next decade.",
            f"People don't realize how {topic} affects them.",
            f"The biggest problem with {topic} is the lack of understanding.",
            f"We need to talk about {topic} more openly.",
            f"What I've learned about {topic} surprised me.",
            f"The data on {topic} is really clear.",
            f"Everyone has an opinion about {topic}.",
        ]
        content = random.choice(templates)
        examples.append({
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "You are a speech disfluency detector. Tag the disfluent portions "
                        "with <reparandum></reparandum> tags.\n\n"
                        f"Input: \"{content}\""
                    )
                },
                {
                    "role": "assistant",
                    "content": content
                }
            ]
        })

    print(f"  Synthetic video-editing: {len(examples)} examples")
    return examples


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="disfluency_training.jsonl")
    parser.add_argument("--skip-download", action="store_true", help="Skip HuggingFace downloads")
    args = parser.parse_args()

    random.seed(42)
    all_examples = []

    print("Preparing disfluency training data...")
    print()

    # Real datasets
    if not args.skip_download:
        print("[Tier 1] Downloading real datasets...")
        all_examples.extend(try_download_disfluency_speech())
        all_examples.extend(try_download_disfl_qa())
        all_examples.extend(try_download_swda())
        print()

    # Synthetic
    print("[Tier 2] Generating video-editing synthetic data...")
    all_examples.extend(generate_video_editing_synthetic(2000))
    print()

    # Shuffle
    random.shuffle(all_examples)

    # Split train/val
    val_size = min(200, len(all_examples) // 10)
    val_examples = all_examples[:val_size]
    train_examples = all_examples[val_size:]

    # Write
    output_path = Path(args.output)
    with open(output_path, "w", encoding="utf-8") as f:
        for item in train_examples:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    val_path = output_path.parent / "disfluency_validation.jsonl"
    with open(val_path, "w", encoding="utf-8") as f:
        for item in val_examples:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    # Stats
    print(f"Total: {len(all_examples)} examples")
    print(f"  Train: {len(train_examples)} -> {output_path}")
    print(f"  Val:   {len(val_examples)} -> {val_path}")

    # Count types
    has_tag = sum(1 for e in all_examples if "<reparandum>" in e["messages"][1]["content"])
    no_tag = len(all_examples) - has_tag
    print(f"  With disfluency tags: {has_tag} ({has_tag/len(all_examples)*100:.1f}%)")
    print(f"  Clean (no tags): {no_tag} ({no_tag/len(all_examples)*100:.1f}%)")


if __name__ == "__main__":
    main()
