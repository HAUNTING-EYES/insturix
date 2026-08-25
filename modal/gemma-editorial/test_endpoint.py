"""
Test the Gemma Editorial Endpoint against the Hank Green video.

Pulls transcript segments from MongoDB, sends to Modal endpoint,
compares decisions against the known-good run (proj_ZyF9IKnLsk5U).

Usage:
  # After deploying: modal deploy finetune_and_deploy.py
  EDITRON_MODAL_PROXY_AUTH_TOKEN_ID=... EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET=... \
    python test_endpoint.py --endpoint https://YOUR--gemma-editorial-editorialclassifier-classify.modal.run

  # Or test against a specific project
  python test_endpoint.py --project proj_ZyF9IKnLsk5U --endpoint URL
"""

import os
import sys
import argparse
import requests


def get_segments_from_mongo(project_id: str) -> list[dict]:
    """Pull transcript segments from MongoDB."""
    try:
        from pymongo import MongoClient
    except ImportError:
        print("pip install pymongo first")
        sys.exit(1)

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("MONGODB_URI is required; refusing to use a committed fallback connection string")
        sys.exit(1)
    client = MongoClient(uri)
    db = client["editron_prev"]
    proj = db.projects.find_one({"projectId": project_id})

    if not proj or not proj.get("rawFootageAnalysis"):
        print(f"Project {project_id} not found or no rawFootageAnalysis")
        sys.exit(1)

    segments = proj["rawFootageAnalysis"]["segments"]
    print(f"Loaded {len(segments)} segments from {project_id}")
    client.close()
    return segments


def call_endpoint(endpoint: str, segments: list[dict], modal_key: str = "", modal_secret: str = "") -> dict:
    """Call the Modal endpoint."""
    payload = {
        "segments": [
            {"index": s["index"], "text": s["text"], "startSec": round(s["startMs"] / 1000)}
            for s in segments
        ]
    }

    if not modal_key or not modal_secret:
        print("EDITRON_MODAL_PROXY_AUTH_TOKEN_ID and EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET are required")
        sys.exit(1)
    headers = {
        "Content-Type": "application/json",
        "Modal-Key": modal_key,
        "Modal-Secret": modal_secret,
    }

    print(f"Sending {len(segments)} segments to {endpoint}...")
    response = requests.post(endpoint, json=payload, headers=headers, timeout=300)

    if response.status_code != 200:
        print(f"ERROR: {response.status_code} {response.text[:200]}")
        sys.exit(1)

    return response.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="proj_ZyF9IKnLsk5U", help="MongoDB project ID")
    parser.add_argument("--endpoint", required=True, help="Modal endpoint URL")
    parser.add_argument("--modal-key", default=os.environ.get("EDITRON_MODAL_PROXY_AUTH_TOKEN_ID", ""))
    parser.add_argument("--modal-secret", default=os.environ.get("EDITRON_MODAL_PROXY_AUTH_TOKEN_SECRET", ""))
    args = parser.parse_args()

    # Get segments
    segments = get_segments_from_mongo(args.project)

    # Call endpoint
    result = call_endpoint(args.endpoint, segments, args.modal_key, args.modal_secret)

    # Show results
    decisions = result.get("decisions", [])
    summary = result.get("summary", {})

    print(f"\nResults: {summary.get('keep', '?')} KEEP, {summary.get('cut', '?')} CUT")
    print()

    # Show kept segments
    kept = [d for d in decisions if d["decision"] == "KEEP"]
    print(f"=== KEPT SEGMENTS ({len(kept)}) ===")
    seg_map = {s["index"]: s for s in segments}
    for k in kept:
        seg = seg_map.get(k["index"], {})
        text = seg.get("text", "?")[:100]
        sec = round(seg.get("startMs", 0) / 1000)
        print(f"  [{k['index']}] ({sec}s) \"{text}\"")

    # Check key content
    print("\n=== KEY CONTENT CHECK ===")
    key_phrases = [
        ("Thesis", "internet brings out the worst"),
        ("Counter-thesis", "anonymity doesn't bring out"),
        ("Punchline", "brings out the worst people"),
        ("D-bag", "imagine.*d.bag"),
        ("Conclusion", "because they're people"),
    ]

    import re
    for name, pattern in key_phrases:
        found = False
        for k in kept:
            seg = seg_map.get(k["index"], {})
            if re.search(pattern, seg.get("text", ""), re.IGNORECASE):
                found = True
                break
        status = "PRESENT" if found else "MISSING"
        print(f"  {name}: {status}")

    # Check meta
    print("\n=== META CHECK (should be CUT) ===")
    meta_phrases = ["editing a video", "put this at the beginning", "mic is on", "start over"]
    for phrase in meta_phrases:
        for k in kept:
            seg = seg_map.get(k["index"], {})
            if phrase.lower() in seg.get("text", "").lower():
                print(f"  WARNING: \"{phrase}\" survived in kept segment {k['index']}")
                break


if __name__ == "__main__":
    main()
