"""
MiniCPM-o test — can it edit raw footage WITHOUT fine-tuning?

Sends the actual video + transcript to MiniCPM-o and asks it to
make editorial KEEP/CUT decisions by watching the footage.
"""
from __future__ import annotations
import modal

app = modal.App("minicpm-editorial-test")

image = (
    modal.Image.from_registry("nvidia/cuda:12.4.0-devel-ubuntu22.04", add_python="3.11")
    .apt_install("ffmpeg", "libsndfile1", "git")
    .pip_install(
        "torch>=2.4",
        "torchaudio",
        "transformers==4.44.2",
        "huggingface_hub",
        "accelerate",
        "Pillow",
        "decord",
        "soundfile",
        "librosa",
    )
    .pip_install("flash-attn", extra_options="--no-build-isolation")
)


@app.function(
    image=image,
    gpu="A100",
    timeout=600,
)
def test_editorial_with_video(video_url: str, segments_json: str):
    """Test MiniCPM-o's ability to make editorial decisions from video."""
    import torch
    import json
    from transformers import AutoModel, AutoTokenizer

    print("[MiniCPM] Loading model...")
    model = AutoModel.from_pretrained(
        "openbmb/MiniCPM-o-2_6",
        trust_remote_code=True,
        attn_implementation="eager",
        torch_dtype=torch.bfloat16,
    ).eval().cuda()
    tokenizer = AutoTokenizer.from_pretrained(
        "openbmb/MiniCPM-o-2_6",
        trust_remote_code=True,
    )

    segments = json.loads(segments_json)

    # Build segment list for the prompt
    seg_list = "\n".join(
        f"[{s['index']}] ({s['startSec']}s) \"{s['text']}\""
        for s in segments[:100]  # Limit to first 100 for context window
    )

    prompt = (
        "You are a professional video editor making a rough cut of raw footage.\n\n"
        "Below are transcript segments from this video. The speaker recorded this "
        "with retakes, stutters, meta-commentary, and false starts.\n\n"
        "For each segment, decide KEEP or CUT.\n"
        "CUT: stutters, retakes, meta about recording, incomplete thoughts, filler.\n"
        "KEEP: actual content, thesis, arguments, punchlines, conclusion.\n"
        "When in doubt, KEEP.\n\n"
        f"Segments:\n{seg_list}\n\n"
        "Respond with JSON: {\"keep\": [indices], \"cut\": [indices]}"
    )

    print(f"[MiniCPM] Processing {len(segments[:100])} segments...")

    # Text-only mode (no video frames for now — test if the model understands the task)
    msgs = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]

    result = model.chat(msgs=msgs, tokenizer=tokenizer, max_new_tokens=4096)

    print(f"[MiniCPM] Raw response length: {len(result)}")
    print(f"[MiniCPM] Response: {result[:500]}")

    # Parse
    try:
        # Find JSON in response
        import re
        json_match = re.search(r'\{.*\}', result, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
            keep = parsed.get("keep", [])
            cut = parsed.get("cut", [])
            print(f"\n[MiniCPM] KEEP: {len(keep)}, CUT: {len(cut)}")
            return {"keep": keep, "cut": cut, "raw": result[:1000]}
    except Exception as e:
        print(f"[MiniCPM] Parse error: {e}")

    return {"keep": [], "cut": [], "raw": result[:2000]}


@app.local_entrypoint()
def main():
    import json

    # Load segments from MongoDB
    try:
        from pymongo import MongoClient
        client = MongoClient("mongodb+srv://admin:iWPwpRrZ5Pp9rWEW@main-cluster.glgebdc.mongodb.net/?retryWrites=true&w=majority")
        db = client["editron_prev"]
        proj = db.projects.find_one({"projectId": "proj_ZyF9IKnLsk5U"})
        segments = proj["rawFootageAnalysis"]["segments"]
        client.close()

        seg_data = [{"index": s["index"], "text": s["text"], "startSec": round(s["startMs"] / 1000)} for s in segments]
        print(f"Loaded {len(seg_data)} segments")

    except Exception as e:
        print(f"MongoDB error: {e}, using test data")
        seg_data = [
            {"index": 0, "text": "Hello!", "startSec": 0},
            {"index": 1, "text": "Is my mic on?", "startSec": 2},
            {"index": 2, "text": "The internet brings out the worst in people.", "startSec": 5},
        ]

    result = test_editorial_with_video.remote("", json.dumps(seg_data))

    print(f"\n=== RESULTS ===")
    print(f"KEEP: {len(result['keep'])}")
    print(f"CUT: {len(result['cut'])}")
    print(f"\nRaw response: {result['raw'][:500]}")
