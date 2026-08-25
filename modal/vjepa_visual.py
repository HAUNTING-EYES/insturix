"""
V-JEPA 2 Visual Analysis — Modal Serverless GPU Endpoint
Insturix Editron · TRIBE v2 Phase 2A

Analyzes video segments using Meta's V-JEPA 2 encoder to extract:
  - visual_significance: embedding divergence between adjacent segments (0-1)
  - motion_intensity: temporal embedding variance within segment (0-1)
  - action_type: coarse action label from SSv2 classification head
  - motion_type: subject_moving | camera_moving | both | static
  - face_emotion / eye_contact: null (requires separate face model, Phase 3)

Endpoint: POST https://insturix--vjepa-2-visual.modal.run
Auth:     Modal proxy authentication (Modal-Key / Modal-Secret)
Consumer: lib/editron/services/vjepa-service.ts → moment-weight-service.ts (30% Phase 2)

Deploy:   modal deploy modal/vjepa_visual.py
Test:     modal serve modal/vjepa_visual.py   (local dev server)

Model:    facebook/vjepa2-vitl-fpc64-256  (ViT-L, 64 frames, 256px, ~307M params)
GPU:      NVIDIA A10G (24GB VRAM) — ViT-L fp16 uses ~2GB, leaves room for batch
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import modal

if TYPE_CHECKING:
    import numpy as np

# ─── Modal App ──────────────────────────────────────────────────────────────

app = modal.App("vjepa-2-visual")

# ─── Container Image ────────────────────────────────────────────────────────

def download_models():
    """Download V-JEPA 2 weights at image build time (no GPU needed, just files)."""
    from huggingface_hub import snapshot_download
    snapshot_download("facebook/vjepa2-vitl-fpc64-256")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch>=2.4",
        "torchvision>=0.19",
        "transformers>=4.46",
        "accelerate>=1.2",
        "huggingface_hub",
        "opencv-python-headless>=4.9",
        "numpy>=1.26",
        "requests",
        "fastapi[standard]",
    )
    .run_function(download_models)
)

# ─── Constants ──────────────────────────────────────────────────────────────

ENCODER_MODEL_ID = "facebook/vjepa2-vitl-fpc64-256"
MAX_FRAMES_PER_SEGMENT = 64
MIN_FRAMES_PER_SEGMENT = 8
# ✅ Adaptive — SIGNIFICANCE_SCALE deleted. Visual significance now uses z-score
# normalization against the video's own embedding distance distribution. No fixed
# constant needed — each video self-calibrates. See _significance_adaptive().

# Motion intensity: frames are downscaled to MOTION_REFERENCE_SIZE before computing
# pixel diffs, making the divisor resolution-independent.
MOTION_REFERENCE_WIDTH = 480       # ← downscale target for motion computation
MOTION_NORM_DIVISOR = 35.0         # ✅ FALLBACK for < 3 segments. Primary normalization uses
                                   # adaptive z-score (same pattern as visual significance).
                                   # Only used when video has < 3 segments — not enough for z-score.
CAMERA_MOTION_THRESHOLD = 0.6      # fraction of pixels changed → camera
SUBJECT_MOTION_THRESHOLD = 0.3     # fraction threshold for subject vs both
STATIC_INTENSITY_THRESHOLD = 3.0   # mean pixel diff below this → static

# ─── Inference Class ────────────────────────────────────────────────────────


@app.cls(
    image=image,
    gpu="A10G",
    scaledown_window=300,  # 5 min warm
    timeout=600,                 # 10 min max per request
)
class VJEPAAnalyzer:
    """Stateful container: model loaded once, reused across requests."""

    @modal.enter()
    def load_model(self):
        import torch
        from transformers import AutoModel, AutoVideoProcessor

        self.processor = AutoVideoProcessor.from_pretrained(ENCODER_MODEL_ID)
        self.model = AutoModel.from_pretrained(
            ENCODER_MODEL_ID,
            dtype=torch.float16,
        ).cuda()
        self.model.eval()
        self.device = next(self.model.parameters()).device

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def analyze(self, request: dict):
        import time

        t0 = time.time()

        video_url = request.get("video_url")
        segments = request.get("segments", [])
        max_frames_per_segment = _normalize_max_frames_per_segment(request.get("max_frames_per_segment"))

        if not video_url or not segments:
            return {"error": "video_url and segments[] required", "segments": []}

        # ── 1. Download video + extract frames per segment ──────────────
        try:
            frames_by_seg = _extract_segment_frames(video_url, segments, max_frames_per_segment)
        except Exception:
            return {
                "segments": [_empty(s) for s in segments],
                "model_version": "vjepa-2-vitl",
                "processing_time_ms": int((time.time() - t0) * 1000),
            }

        # ── 2. Encode each segment ─────────────────────────────────────
        import torch

        embeddings: list[np.ndarray | None] = []
        raw_motions: list[float] = []
        results: list[dict] = []

        for seg, frames in zip(segments, frames_by_seg):
            if frames is None or len(frames) == 0:
                embeddings.append(None)
                raw_motions.append(0.0)
                results.append(_empty(seg))
                continue

            # V-JEPA 2 encoder forward
            with torch.no_grad():
                inputs = self.processor(frames, return_tensors="pt")
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
                outputs = self.model(**inputs, skip_predictor=True)
                emb = outputs.last_hidden_state.mean(dim=1)  # [1, hidden_size]
                embeddings.append(emb.cpu().float().numpy())

            # Raw motion magnitude (adaptive normalization in step 3.5)
            raw_motion = _motion_raw(frames)
            raw_motions.append(raw_motion)

            # Motion type from spatial distribution of changes
            mtype = _motion_type(frames)
            primitives = _visual_primitives(frames)

            results.append({
                "start_ms": seg["start_ms"],
                "end_ms": seg["end_ms"],
                "visual_significance": 0.5,  # placeholder, step 3
                "motion_intensity": 0.0,     # placeholder, step 3.5
                "action_type": "other",       # no classifier loaded
                "motion_type": mtype,
                "face_emotion": None,
                "eye_contact": None,
                **primitives,
            })

        # ── 3. Visual significance = adaptive z-score against video's own distribution ─
        for i in range(len(results)):
            if embeddings[i] is not None:
                results[i]["visual_significance"] = _significance_adaptive(embeddings, i)

        # ── 3.5. Motion intensity = adaptive z-score against video's own distribution ─
        for i in range(len(results)):
            results[i]["motion_intensity"] = _motion_adaptive(raw_motions, i)

        elapsed_ms = int((time.time() - t0) * 1000)

        return {
            "segments": results,
            "model_version": "vjepa-2-vitl",
            "processing_time_ms": elapsed_ms,
        }


# ─── Video Frame Extraction ────────────────────────────────────────────────


def _normalize_max_frames_per_segment(raw: object) -> int:
    try:
        value = int(raw) if raw is not None else MAX_FRAMES_PER_SEGMENT
    except (TypeError, ValueError):
        return MAX_FRAMES_PER_SEGMENT
    return max(MIN_FRAMES_PER_SEGMENT, min(MAX_FRAMES_PER_SEGMENT, value))

def _extract_segment_frames(
    video_url: str,
    segments: list[dict],
    max_frames_per_segment: int = MAX_FRAMES_PER_SEGMENT,
) -> list[np.ndarray | None]:
    """Download video, extract frames per segment using OpenCV."""
    import tempfile
    import os
    import requests
    import cv2
    import numpy as np

    resp = requests.get(video_url, timeout=120, stream=True)
    resp.raise_for_status()

    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    try:
        for chunk in resp.iter_content(chunk_size=8192):
            tmp.write(chunk)
        tmp.close()

        cap = cv2.VideoCapture(tmp.name)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video from {video_url[:80]}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        result: list[np.ndarray | None] = []

        for seg in segments:
            start_f = int(seg["start_ms"] / 1000.0 * fps)
            end_f = int(seg["end_ms"] / 1000.0 * fps)
            n_frames = min(max_frames_per_segment, max(1, end_f - start_f))

            indices = np.linspace(start_f, max(start_f, end_f - 1), n_frames, dtype=int)
            indices = np.clip(indices, 0, total - 1)

            frames = []
            for idx in indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
                ok, frame = cap.read()
                if ok:
                    # BGR→RGB, HWC format for processor
                    frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

            result.append(np.array(frames) if frames else None)

        cap.release()
        return result
    finally:
        os.unlink(tmp.name)


# ─── Feature Computation Helpers ───────────────────────────────────────────


def _significance_adaptive(embeddings: list, idx: int) -> float:
    """
    ✅ Adaptive visual significance — z-score against the video's own distribution.

    Instead of raw_distance * FIXED_CONSTANT, we compute ALL pairwise cosine distances
    for the video, then express each segment's distance as a z-score relative to that
    distribution. This self-calibrates per video: a talking-head video with tiny embedding
    shifts will still surface the ONE moment where something changes. A fast-cut video
    with large shifts everywhere won't over-report significance.

    Falls back to min-max normalization when < 3 segments (not enough for z-score).
    """
    import numpy as np
    from numpy.linalg import norm

    current = embeddings[idx]
    if current is None:
        return 0.5

    # Compute this segment's mean cosine distance to neighbors
    local_dists = []
    for offset in (-1, 1):
        j = idx + offset
        if 0 <= j < len(embeddings) and embeddings[j] is not None:
            a = current.flatten()
            b = embeddings[j].flatten()
            cos_sim = float(np.dot(a, b) / (norm(a) * norm(b) + 1e-8))
            local_dists.append(1.0 - cos_sim)

    if not local_dists:
        return 0.5

    local_dist = float(np.mean(local_dists))

    # Collect ALL pairwise neighbor distances across the video for distribution
    all_dists = []
    for i in range(len(embeddings)):
        if embeddings[i] is None:
            continue
        for offset in (-1, 1):
            j = i + offset
            if 0 <= j < len(embeddings) and embeddings[j] is not None:
                a = embeddings[i].flatten()
                b = embeddings[j].flatten()
                cos_sim = float(np.dot(a, b) / (norm(a) * norm(b) + 1e-8))
                all_dists.append(1.0 - cos_sim)

    if len(all_dists) < 3:
        # Not enough data for z-score — use min-max normalization
        if len(all_dists) == 0:
            return 0.5
        d_min = min(all_dists)
        d_max = max(all_dists)
        if d_max - d_min < 1e-8:
            return 0.5
        return min(1.0, max(0.0, (local_dist - d_min) / (d_max - d_min)))

    # Z-score: how many standard deviations above the mean is this segment?
    mean_dist = float(np.mean(all_dists))
    std_dist = float(np.std(all_dists))
    if std_dist < 1e-8:
        return 0.5  # all segments equally similar — no standout

    z = (local_dist - mean_dist) / std_dist

    # Map z-score to 0-1: z=0 → 0.5 (average), z=+2 → 1.0 (very significant),
    # z=-2 → 0.0 (very similar to neighbors). Linear mapping centered at 0.5.
    significance = 0.5 + (z * 0.25)
    return min(1.0, max(0.0, significance))


def _motion_adaptive(raw_motions: list[float], idx: int) -> float:
    """
    ✅ Adaptive motion intensity — z-score against the video's own motion distribution.

    Instead of dividing by MOTION_NORM_DIVISOR (fixed 35.0), we compute ALL raw motion
    values for the video, then express each segment's motion as a z-score relative to
    that distribution. This self-calibrates per video: a talking-head video with subtle
    motion will still surface the ONE moment with most movement. A fast-cut video with
    large motion everywhere won't over-report intensity.

    Falls back to MOTION_NORM_DIVISOR normalization when < 3 valid segments.
    """
    import numpy as np

    raw = raw_motions[idx]

    # Zero motion = zero intensity (empty/failed frames or truly static)
    if raw <= 0.0:
        return 0.0

    # Filter out zero-motion segments (empty/failed frames) from distribution.
    # Real video segments always have raw > 0.0 due to sensor noise.
    valid = [m for m in raw_motions if m > 0.0]

    if not valid:
        return 0.0

    if len(valid) < 3:
        # Not enough data for z-score — use proven fixed divisor as fallback.
        # MOTION_NORM_DIVISOR = 35.0 calibrated for 480px-wide reference diffs.
        return min(1.0, max(0.0, raw / MOTION_NORM_DIVISOR))

    mean_m = float(np.mean(valid))
    std_m = float(np.std(valid))

    if std_m < 1e-8:
        # All segments have identical motion — return 0.5 (average, no standout)
        return 0.5

    z = (raw - mean_m) / std_m

    # Map z-score to 0-1: z=0 → 0.5 (average), z=+2 → 1.0 (very intense),
    # z=-2 → 0.0 (very still). Same linear mapping as _significance_adaptive.
    intensity = 0.5 + (z * 0.25)
    return min(1.0, max(0.0, intensity))


def _motion_raw(frames) -> float:
    """
    Raw mean absolute frame difference, resolution-normalized but NOT scaled to 0-1.

    Frames are downscaled to MOTION_REFERENCE_WIDTH before computing diffs,
    making the result resolution-independent. Returns the raw mean pixel diff —
    normalization to 0-1 happens in _motion_adaptive() using z-score against
    the video's own motion distribution.
    """
    import numpy as np
    import cv2

    if frames is None or len(frames) < 2:
        return 0.0

    # Downscale to reference width for resolution-independent diffs
    h, w = frames[0].shape[:2]
    if w > MOTION_REFERENCE_WIDTH:
        scale = MOTION_REFERENCE_WIDTH / w
        new_w = MOTION_REFERENCE_WIDTH
        new_h = int(h * scale)
        resized = np.array([
            cv2.resize(f, (new_w, new_h), interpolation=cv2.INTER_AREA)
            for f in frames
        ])
    else:
        resized = frames

    step = max(1, len(resized) // 8)
    diffs = []
    for i in range(0, len(resized) - step, step):
        diff = np.abs(
            resized[i].astype(np.float32) - resized[i + step].astype(np.float32)
        ).mean()
        diffs.append(diff)

    if not diffs:
        return 0.0

    # Return RAW mean diff — no division by MOTION_NORM_DIVISOR.
    # Adaptive z-score normalization happens in _motion_adaptive().
    return float(np.mean(diffs))


def _motion_type(frames) -> str:
    """Classify motion as subject/camera/both/static from pixel change distribution."""
    import numpy as np
    import cv2

    if frames is None or len(frames) < 2:
        return "static"

    # Downscale to reference width for resolution-independent classification
    h, w = frames[0].shape[:2]
    if w > MOTION_REFERENCE_WIDTH:
        scale = MOTION_REFERENCE_WIDTH / w
        new_w = MOTION_REFERENCE_WIDTH
        new_h = int(h * scale)
        resized = np.array([
            cv2.resize(f, (new_w, new_h), interpolation=cv2.INTER_AREA)
            for f in frames
        ])
    else:
        resized = frames

    n = min(4, len(resized) - 1)
    indices = np.linspace(0, len(resized) - 2, n, dtype=int)

    coverages = []
    intensities = []

    for i in indices:
        diff = np.abs(resized[i].astype(np.float32) - resized[int(i) + 1].astype(np.float32))
        mean_diff = diff.mean()
        if mean_diff < 2.0:
            continue
        significant_frac = float((diff > 15).mean())
        coverages.append(significant_frac)
        intensities.append(mean_diff)

    if not coverages:
        return "static"

    avg_coverage = float(np.mean(coverages))
    avg_intensity = float(np.mean(intensities))

    if avg_intensity < STATIC_INTENSITY_THRESHOLD:
        return "static"
    elif avg_coverage > CAMERA_MOTION_THRESHOLD:
        return "camera_moving"
    elif avg_coverage > SUBJECT_MOTION_THRESHOLD:
        return "both"
    else:
        return "subject_moving"


def _visual_primitives(frames) -> dict:
    """Extract stable geometry primitives for overlay planning."""
    subject = _subject_bbox(frames)
    text_boxes = _text_boxes(frames)
    motion_x, motion_y = _motion_vector(frames)
    negative_space = _negative_space(subject, text_boxes)

    text_coverage = min(1.0, max(0.0, sum(
        b["width"] * b["height"] for b in text_boxes
    )))

    return {
        "motion_vector_x": motion_x,
        "motion_vector_y": motion_y,
        "main_subject": subject,
        "main_subject_x": subject["x"],
        "main_subject_y": subject["y"],
        "main_subject_width": subject["width"],
        "main_subject_height": subject["height"],
        "text_boxes": text_boxes,
        "text_box_count": len(text_boxes),
        "text_coverage": text_coverage,
        "object_count": 1 if subject["confidence"] > 0.25 else 0,
        "face_count": 0,
        "negative_space_top": negative_space["top"],
        "negative_space_right": negative_space["right"],
        "negative_space_bottom": negative_space["bottom"],
        "negative_space_left": negative_space["left"],
    }


def _motion_vector(frames) -> tuple[float, float]:
    """Signed dominant frame translation, normalized to roughly -1..1."""
    import cv2
    import numpy as np

    if frames is None or len(frames) < 2:
        return 0.0, 0.0

    first = cv2.cvtColor(frames[0], cv2.COLOR_RGB2GRAY)
    last = cv2.cvtColor(frames[-1], cv2.COLOR_RGB2GRAY)
    width = 240
    scale = width / max(1, first.shape[1])
    height = max(1, int(first.shape[0] * scale))
    first = cv2.resize(first, (width, height), interpolation=cv2.INTER_AREA)
    last = cv2.resize(last, (width, height), interpolation=cv2.INTER_AREA)

    shift, response = cv2.phaseCorrelate(
        first.astype(np.float32),
        last.astype(np.float32),
    )
    if response < 0.05:
        return 0.0, 0.0

    dx = _clamp_signed(float(shift[0]) / max(1.0, width * 0.12))
    dy = _clamp_signed(float(shift[1]) / max(1.0, height * 0.12))
    return dx, dy


def _subject_bbox(frames) -> dict:
    """Motion/salience-derived subject bbox with confidence, not identity."""
    import cv2
    import numpy as np

    fallback = {"x": 0.25, "y": 0.15, "width": 0.5, "height": 0.7, "confidence": 0.1}
    if frames is None or len(frames) < 2:
        return fallback

    h, w = frames[0].shape[:2]
    diffs = []
    sample_count = min(6, len(frames) - 1)
    indices = np.linspace(0, len(frames) - 2, sample_count, dtype=int)
    for i in indices:
        a = cv2.cvtColor(frames[int(i)], cv2.COLOR_RGB2GRAY)
        b = cv2.cvtColor(frames[int(i) + 1], cv2.COLOR_RGB2GRAY)
        diffs.append(cv2.absdiff(a, b))

    if not diffs:
        return fallback

    motion = np.mean(diffs, axis=0).astype(np.uint8)
    motion = cv2.GaussianBlur(motion, (9, 9), 0)
    _, mask = cv2.threshold(motion, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((17, 17), np.uint8))

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    min_area = max(64, int(w * h * 0.01))
    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        area = bw * bh
        if area >= min_area:
            boxes.append((x, y, bw, bh, area))

    if not boxes:
        return fallback

    boxes = sorted(boxes, key=lambda b: b[4], reverse=True)[:3]
    x1 = min(b[0] for b in boxes)
    y1 = min(b[1] for b in boxes)
    x2 = max(b[0] + b[2] for b in boxes)
    y2 = max(b[1] + b[3] for b in boxes)
    area_ratio = ((x2 - x1) * (y2 - y1)) / max(1, w * h)

    if area_ratio > 0.85:
        return {**fallback, "confidence": 0.18}

    pad_x = int(w * 0.04)
    pad_y = int(h * 0.04)
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w, x2 + pad_x)
    y2 = min(h, y2 + pad_y)

    return {
        "x": _clamp01(x1 / w),
        "y": _clamp01(y1 / h),
        "width": _clamp01((x2 - x1) / w),
        "height": _clamp01((y2 - y1) / h),
        "confidence": _clamp01(0.35 + min(0.55, area_ratio)),
    }


def _text_boxes(frames) -> list[dict]:
    """Detect text-like high-contrast horizontal regions without OCR."""
    import cv2
    import numpy as np

    if frames is None or len(frames) == 0:
        return []

    frame = frames[len(frames) // 2]
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 80, 180)
    kernel_w = max(9, int(w * 0.025))
    kernel_h = max(3, int(h * 0.006))
    dilated = cv2.dilate(edges, np.ones((kernel_h, kernel_w), np.uint8), iterations=1)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        area_ratio = (bw * bh) / max(1, w * h)
        aspect = bw / max(1, bh)
        if (
            aspect >= 1.8
            and 0.006 <= area_ratio <= 0.18
            and bw >= w * 0.05
            and h * 0.012 <= bh <= h * 0.18
        ):
            candidates.append({
                "x": _clamp01(x / w),
                "y": _clamp01(y / h),
                "width": _clamp01(bw / w),
                "height": _clamp01(bh / h),
                "confidence": _clamp01(0.35 + min(0.45, aspect / 12.0)),
            })

    candidates.sort(key=lambda b: b["width"] * b["height"], reverse=True)
    kept = []
    for box in candidates:
        if all(_box_iou(box, existing) < 0.35 for existing in kept):
            kept.append(box)
        if len(kept) >= 8:
            break
    return kept


def _negative_space(subject: dict, text_boxes: list[dict]) -> dict:
    left = subject["x"]
    right = 1.0 - (subject["x"] + subject["width"])
    top = subject["y"]
    bottom = 1.0 - (subject["y"] + subject["height"])

    for box in text_boxes:
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        penalty = min(0.25, box["width"] * box["height"] * 2)
        if cy < 0.35:
            top -= penalty
        if cy > 0.65:
            bottom -= penalty
        if cx < 0.35:
            left -= penalty
        if cx > 0.65:
            right -= penalty

    return {
        "top": _clamp01(top),
        "right": _clamp01(right),
        "bottom": _clamp01(bottom),
        "left": _clamp01(left),
    }


def _box_iou(a: dict, b: dict) -> float:
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = a["x"] + a["width"], a["y"] + a["height"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = b["x"] + b["width"], b["y"] + b["height"]
    inter_w = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    inter_h = max(0.0, min(ay2, by2) - max(ay1, by1))
    inter = inter_w * inter_h
    union = a["width"] * a["height"] + b["width"] * b["height"] - inter
    return inter / union if union > 0 else 0.0


def _clamp01(value: float) -> float:
    return min(1.0, max(0.0, float(value)))


def _clamp_signed(value: float) -> float:
    return min(1.0, max(-1.0, float(value)))


def _empty(seg: dict) -> dict:
    return {
        "start_ms": seg.get("start_ms", 0),
        "end_ms": seg.get("end_ms", 0),
        "visual_significance": 0.5,
        "motion_intensity": 0.0,
        "action_type": "other",
        "motion_type": "static",
        "face_emotion": None,
        "eye_contact": None,
        "motion_vector_x": 0.0,
        "motion_vector_y": 0.0,
        "main_subject": {"x": 0.25, "y": 0.15, "width": 0.5, "height": 0.7, "confidence": 0.0},
        "main_subject_x": 0.25,
        "main_subject_y": 0.15,
        "main_subject_width": 0.5,
        "main_subject_height": 0.7,
        "text_boxes": [],
        "text_box_count": 0,
        "text_coverage": 0.0,
        "object_count": 0,
        "face_count": 0,
        "negative_space_top": 0.15,
        "negative_space_right": 0.25,
        "negative_space_bottom": 0.15,
        "negative_space_left": 0.25,
    }
