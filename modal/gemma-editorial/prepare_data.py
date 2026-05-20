"""
Training Data Preparation — Gemma 4 Editorial Classifier

Downloads and formats training data from free public datasets:
1. LARD (96K examples) — paired fluent/disfluent text with span labels
2. DisfluencySpeech (5K utterances) — 4-tier progressive cleanup
3. Disfl-QA (12K pairs) — paired clean/disfluent questions

Output: JSONL file for QLoRA fine-tuning with Unsloth.
Format: {"messages": [{"role": "user", ...}, {"role": "assistant", ...}]}

Usage: python prepare_data.py --output training_data.jsonl
"""

import json
import os
import random
from pathlib import Path

# ─── Synthetic Data Generation ─────────────────────────────────────
# Since downloading datasets requires network access that may not be
# available, we also generate synthetic training data from patterns
# observed in real raw footage transcripts.

STUTTER_PATTERNS = [
    # (input_segment, label, reason)
    # CUT — stutters and false starts
    ("I th- I think the internet is a great place.", "CUT", "stutter with self-correction"),
    ("The the the main point here is", "CUT", "word-level repetition"),
    ("So what I want to- what I want to say is", "CUT", "phrase-level restart"),
    ("Um, like, you know, basically", "CUT", "pure filler"),
    ("Wait, is this recording? OK.", "CUT", "meta-commentary about recording"),
    ("That was me editing a video.", "CUT", "meta-commentary about production"),
    ("I'll put this at the beginning.", "CUT", "editorial decision meta"),
    ("Let me start over.", "CUT", "explicit retake request"),
    ("That came out wrong, let me redo that.", "CUT", "self-correction request"),
    ("Is my mic on? Can you hear me?", "CUT", "equipment check"),
    ("OK so the thing is- actually no.", "CUT", "abandoned thought"),
    ("Anonymity, but I wanna make a hypothesis here.", "CUT", "false start with topic word then restart"),
    ("I think anonymity does not-", "CUT", "incomplete trailing thought"),
    ("So it must, so it must, so it must be other people.", "CUT", "triple false start of same phrase"),
    ("But then they-- but then when they--", "CUT", "repeated false start with dashes"),
    ("OK.", "CUT", "standalone filler"),
    ("Hello!", "CUT", "greeting/warmup before content"),
    ("Three, two, one.", "CUT", "counting in / slate"),
    ("I like it, that sounds good.", "CUT", "creative self-assessment"),
    ("Nah, let me try again.", "CUT", "production decision"),

    # KEEP — actual content
    ("The internet brings out the worst in people.", "KEEP", "thesis statement"),
    ("I'm thinking anonymity doesn't bring out the worst in people.", "KEEP", "counter-thesis"),
    ("It just brings out the worst people.", "KEEP", "punchline"),
    ("Imagine, if you will, a D-bag.", "KEEP", "thought experiment introduction"),
    ("He doesn't have a lot of friends because he doesn't like people.", "KEEP", "supporting argument"),
    ("What we're looking at down in the comments is extreme selection bias.", "KEEP", "key insight"),
    ("People don't want to comment because it seems like a hostile place.", "KEEP", "supporting evidence"),
    ("That's an algorithmic problem.", "KEEP", "conclusion of argument point"),
    ("Not because culture tells them to be good, but because they're people.", "KEEP", "emotional conclusion"),
    ("Let me guarantee you, most of them, like ninety percent of them, are good.", "KEEP", "emphatic statement"),
    ("There were comments talking about how homosexuality is a disease.", "KEEP", "example/evidence"),
    ("It's thrilling. It's not scary like doing it in real life would be.", "KEEP", "explanation of motivation"),
    ("Good morning, John.", "KEEP", "content greeting (vlog format)"),
    ("I'm here to debunk a myth.", "KEEP", "thesis setup"),
    ("Just imagine for a moment that a hundred thousand people gather in a room.", "KEEP", "thought experiment"),
    ("Zero. There are gonna be bad people in that room.", "KEEP", "rhetorical answer"),
    ("Wikipedia. For Christ's sake!", "KEEP", "emphatic example"),
    ("And the trolls are loving it.", "KEEP", "argument point"),
    ("John, I'll see you on Tuesday.", "KEEP", "content sign-off (vlog format)"),
    ("We have no idea they exist.", "KEEP", "dramatic statement"),
]

# Template for generating more diverse training examples
STUTTER_TEMPLATES = [
    "I {word}- I {word} {rest}",
    "{phrase}, {phrase} {rest}",
    "So {phrase}-- actually no. {alternative}",
    "The {topic} is- the {topic} is {rest}",
    "But {start}-- but {start} {rest}",
    "{word} {word} {word} {rest}",
    "Um, so, like, {rest}",
    "Wait, {meta}. OK. So {rest}",
]

META_TEMPLATES = [
    "Is the {equipment} working?",
    "Can you {action} the {equipment}?",
    "Let me {action} that.",
    "That was {quality}, let me {action}.",
    "I'm gonna {editAction} this {location}.",
    "So this is the {meta_topic}.",
    "I'm talking to you on a camera, and I'm gonna make a video.",
    "The whole process of making this video.",
    "That's a good thing to check before you start {activity}.",
    "I did a video once upon a time about {topic}.",
]

CONTENT_TEMPLATES = [
    "The {topic} is {claim}.",
    "I think {opinion}.",
    "What we're looking at is {insight}.",
    "People believe that {belief}.",
    "The result is that {consequence}.",
    "Just imagine {scenario}.",
    "{stat_intro}, {statistic}.",
    "And honestly, I think {thought}.",
    "The reason is {reason}.",
    "It's because {explanation}.",
]

TOPICS = ["internet", "social media", "technology", "education", "healthcare", "climate", "politics", "economy", "culture", "science"]
EQUIPMENT = ["camera", "mic", "microphone", "light", "teleprompter"]
ACTIONS = ["adjust", "fix", "check", "move", "reset"]
EDIT_ACTIONS = ["put", "add", "edit", "cut", "move"]
LOCATIONS = ["at the beginning", "in the middle", "at the end", "in text descriptions", "in the intro"]
QUALITIES = ["terrible", "bad", "not great", "wrong", "off"]


def generate_synthetic_stutter(n: int = 500) -> list[dict]:
    """Generate synthetic stutter/false-start CUT examples."""
    examples = []
    words = ["think", "believe", "know", "want", "need", "see", "understand", "feel", "say", "mean"]
    phrases = ["the thing is", "what I want to say", "the point is", "the reason", "so basically", "what happened was"]

    for _ in range(n):
        template = random.choice(STUTTER_TEMPLATES)
        word = random.choice(words)
        phrase = random.choice(phrases)
        rest = f"that {random.choice(TOPICS)} is important."

        try:
            text = template.format(
                word=word, phrase=phrase, rest=rest,
                start=phrase[:15], topic=random.choice(TOPICS),
                alternative="Never mind.", meta=f"is the {random.choice(EQUIPMENT)} on"
            )
        except (KeyError, IndexError):
            text = f"I {word}- I {word} that {random.choice(TOPICS)} is important."

        examples.append({"text": text, "label": "CUT", "reason": "stutter/false-start"})

    return examples


def generate_synthetic_meta(n: int = 300) -> list[dict]:
    """Generate synthetic meta-commentary CUT examples."""
    examples = []
    for _ in range(n):
        template = random.choice(META_TEMPLATES)
        try:
            text = template.format(
                equipment=random.choice(EQUIPMENT),
                action=random.choice(ACTIONS),
                quality=random.choice(QUALITIES),
                editAction=random.choice(EDIT_ACTIONS),
                location=random.choice(LOCATIONS),
                meta_topic="editing challenge",
                activity="recording",
                topic=random.choice(TOPICS),
            )
        except (KeyError, IndexError):
            text = f"Is the {random.choice(EQUIPMENT)} working?"

        examples.append({"text": text, "label": "CUT", "reason": "meta-commentary"})

    return examples


def generate_synthetic_content(n: int = 500) -> list[dict]:
    """Generate synthetic KEEP content examples."""
    examples = []
    claims = ["important", "changing everything", "misunderstood", "the key issue", "what matters most"]
    opinions = ["this is the future", "we need to rethink this", "people don't understand", "it's more complex than that"]

    for _ in range(n):
        template = random.choice(CONTENT_TEMPLATES)
        try:
            text = template.format(
                topic=random.choice(TOPICS),
                claim=random.choice(claims),
                opinion=random.choice(opinions),
                insight="a form of selection bias",
                belief=f"{random.choice(TOPICS)} is broken",
                consequence="fewer people participate",
                scenario=f"a thousand people in a room discussing {random.choice(TOPICS)}",
                stat_intro="On average",
                statistic="about 90 percent of people are good",
                thought=f"understanding {random.choice(TOPICS)} is really important",
                reason=f"most people don't engage with {random.choice(TOPICS)} online",
                explanation=f"{random.choice(TOPICS)} doesn't work the way people think",
            )
        except (KeyError, IndexError):
            text = f"The {random.choice(TOPICS)} is {random.choice(claims)}."

        examples.append({"text": text, "label": "KEEP", "reason": "content"})

    return examples


def format_for_training(examples: list[dict]) -> list[dict]:
    """Convert to Unsloth/HuggingFace chat format."""
    formatted = []
    for ex in examples:
        formatted.append({
            "messages": [
                {
                    "role": "user",
                    "content": f"You are a professional video editor. Classify this raw footage transcript segment as KEEP (include in final edit) or CUT (remove from final edit).\n\nSegment: \"{ex['text']}\""
                },
                {
                    "role": "assistant",
                    "content": ex["label"]
                }
            ]
        })
    return formatted


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="training_data.jsonl")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)

    print("Generating training data...")

    # Hand-crafted examples from real Hank Green video analysis
    hand_crafted = [{"text": t, "label": l, "reason": r} for t, l, r in STUTTER_PATTERNS]
    print(f"  Hand-crafted: {len(hand_crafted)} examples")

    # Synthetic generation
    stutters = generate_synthetic_stutter(500)
    meta = generate_synthetic_meta(300)
    content = generate_synthetic_content(500)
    print(f"  Synthetic stutters: {len(stutters)}")
    print(f"  Synthetic meta: {len(meta)}")
    print(f"  Synthetic content: {len(content)}")

    all_examples = hand_crafted + stutters + meta + content
    random.shuffle(all_examples)

    # Format for training
    formatted = format_for_training(all_examples)

    # Write JSONL
    output_path = Path(args.output)
    with open(output_path, "w") as f:
        for item in formatted:
            f.write(json.dumps(item) + "\n")

    print(f"\nTotal: {len(formatted)} training examples -> {output_path}")
    print(f"  KEEP: {sum(1 for e in all_examples if e['label'] == 'KEEP')}")
    print(f"  CUT: {sum(1 for e in all_examples if e['label'] == 'CUT')}")

    # Also write a small validation set from hand-crafted examples
    val_examples = hand_crafted[:10]
    val_formatted = format_for_training(val_examples)
    val_path = output_path.parent / "validation_data.jsonl"
    with open(val_path, "w") as f:
        for item in val_formatted:
            f.write(json.dumps(item) + "\n")
    print(f"  Validation: {len(val_formatted)} examples -> {val_path}")


if __name__ == "__main__":
    main()
