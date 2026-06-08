# Deterministic Editorial-Cut Classification for `calibrate.ts`

**A decision-grade research report for the Editron team**
Date: 2026-06-08 · Scope: replacing/augmenting the ffmpeg `select=gt(scene,T)` reference-cut counter in `editron-worktree/scripts/calibrate/calibrate.ts`

> **Honesty up front.** The survey legs of this report could not run live web search; their citations are from model knowledge and from primary sources fetched in earlier sessions (PySceneDetect source, FFmpeg `vf_scdet.c`, the TRECVID survey). I have re-grounded every claim about *our* code against the actual file (read this session). Where a number is a literature range rather than a re-verified constant, it is marked. Per Rule 31, do not hardcode any threshold below without the validation pass in §4 producing it from our own footage.

---

## 1. Problem statement (precise)

### 1.1 What the code does today

`detectReferenceEditingFromLocalVideo` (calibrate.ts:395) runs, for each threshold in `REFERENCE_SCENE_THRESHOLDS = [0.25, 0.35, 0.45]` (line 206), the command:

```
ffmpeg -hide_banner -nostats -i <local> -vf "select=gt(scene\,<T>),showinfo" -an -f null -
```

It parses `pts_time:` tokens from `showinfo` (`parseFfmpegSceneDetectionOutput`, line 323), dedupes them with a 220 ms floor (`MIN_REFERENCE_CUT_SEPARATION_MS`, line 207), then `selectDeterministicReferenceCandidate` (line 338) clusters detections across the three thresholds inside a 450 ms window (`REFERENCE_SCENE_CONSENSUS_WINDOW_MS`, line 208) and keeps a cluster only if it is **either** supported by ≥2 thresholds **or** by a threshold ≥ the median (0.35). The surviving timestamps become `naturalCutPoints` / `transitionTypes` (all typed `hard-cut`), and the **count** drives `cutsPerMinute → pacing_velocity` (lines 834-860), which is the calibration signal that feeds the bandit (lines 997-1006).

So the cut **count** is the load-bearing output. Everything downstream (pacing velocity, the `pacingAligned` kept/removed outcome at line 1000) is a function of it.

### 1.2 Why it is wrong

FFmpeg's `scene` expression is **MAFD** — Mean Absolute Frame Difference of the luma plane, i.e. SAD between consecutive frames normalized to 0–1 (verified against `vf_scdet.c`: `mafd = sad * 100 / count / (1<<bitdepth)`; the `select` filter's `scene` var is the same family scaled to 0–1). **MAFD measures visual change, not shot replacement.** A whip-pan, fast zoom, action burst, or single-frame flash moves most pixels between consecutive frames and therefore produces a large `scene` value *without any cut*. The canonical statement of the failure (Wikipedia, *Shot transition detection*, citing the SAD metric): *"SAD reacts very sensitively to even minor changes within a scene: fast movements of the camera, explosions or the simple switching on of a light … result in false hits."*

This produces the two observed symptoms:

- **Over-count on high-motion content (MrBeast: 728 measured vs ~50 real).** Sustained motion holds MAFD above 0.25–0.45 for many consecutive frames; the 220 ms separation floor caps the damage but a 0.45-threshold pan still emits a detection every ~quarter-second. Note the existing consensus filter does **not** fix this: during a real pan all three thresholds fire together, so the "≥2 thresholds agree" rule *confirms* the false positive rather than rejecting it. Multi-threshold consensus on the *same* MAFD signal is correlated noise, not independent evidence.
- **Under-count on screencast.** A screencast cut (slide N → slide N+1) may change only a title bar and a chart while 70% of the frame (background, chrome) is identical → MAFD stays below 0.25 → missed. Meanwhile a fixed threshold tuned to catch it would explode on the MrBeast case. There is no single `T` that serves both — which is the whole reason adaptive/normalized methods exist.

### 1.3 Requirements for the replacement

1. **Deterministic** — identical input + params ⇒ identical cut list (calibration must be reproducible; Rule 31/34). Rules out anything stochastic.
2. **Motion-robust** — must distinguish "all pixels changed because the camera moved" from "all pixels changed because the shot was replaced." This is *the* requirement.
3. **Drops into Node + ffmpeg on Windows** — the current pipeline `spawnSync`s ffmpeg/ffprobe/yt-dlp. The replacement must not require a GPU or a fragile native toolchain on the calibration box (which already hits `0xC0000142 STATUS_DLL_INIT_FAILED` under memory pressure, line 403-412 — so we must not *add* memory pressure or DLL surface).
4. **Hard cuts are the target.** Editron edits are overwhelmingly hard cuts; the calibration signal is `cutsPerMinute`. Gradual-transition recall is a **nice-to-have**, not a gate (see §1.4).

### 1.4 Scope boundary (important, and honest)

The "real editorial cut" we need to count is a **hard cut** — an abrupt shot replacement. Per the TRECVID convention (Smeaton/Over/Doherty, *Seven Years of TRECVid Activity*, CVIU 2010), a transition ≤5 frames is scored as a cut; dissolves/wipes/fades are a *separate* category that even the best classical systems detect at only F≈0.55–0.79 vs F≈0.90–0.95 for cuts. **We should not try to solve graduals deterministically in calibrate.ts.** Every method in §3 that rejects motion (adaptive ratio, local-max) will also *suppress* slow dissolves, because a dissolve is itself a slow plateau. That is an acceptable, even desirable, trade for a *cut-count* signal: a dissolve is not a hard cut and arguably should not inflate `cutsPerMinute`. If gradual classification is ever needed, it belongs to a different component (the Gemini 5-Track pass already labels `transitionTypes` semantically, lines 478-496) — not the deterministic counter.

---

## 2. The method landscape

Each method is graded on **motion-robustness** (the requirement) and **determinism** (the gate). All listed methods are deterministic; they differ entirely in how they suppress motion false-positives. FFmpeg's `scene`/`scdet` is method #1 — the crudest — which is exactly why we are here.

### 2.1 Frame-difference / SAD / MAFD — *the family we are leaving*

**Signal:** mean absolute per-pixel luma delta between frame *f* and *f−1*; threshold it. This is ffmpeg `scene` (0–1) and `scdet`'s `mafd` (0–100).
**Motion robustness: worst.** No spatial tolerance — any global shift (pan/zoom) or brightness change (flash) lights up every pixel. This is the root cause in §1.2.
**Determinism:** full (integer pixel arithmetic, fixed build).
**Citations:** Zhang, Kankanhalli & Smoliar, *Automatic partitioning of full-motion video*, Multimedia Systems 1993 (foundational); Boreczky & Rowe, *Comparison of video shot boundary detection techniques*, SPIE/JEI 1996; FFmpeg `vf_scdet.c` (`get_scene_score`, MAFD).
**Verdict for us:** keep only as the *raw signal source* (it's cheap and already wired), never as the *decision rule*.

### 2.2 Colour-histogram difference — *the classic robust baseline*

**Signal:** per-frame colour histogram (e.g. quantized RGB 4×4×4, or HSV); distance between consecutive histograms via χ², intersection, or bin-wise L1. Often block/regional (3×3 tiles, voted) to restore spatial sensitivity.
**Motion robustness: good** for pans/zooms — a histogram is position-invariant, so relocating the same pixels barely changes it. **Blind spots:** two different shots with similar palettes (false negative); a brightness flash still shifts mass toward bright bins (partial false positive); a large object entering frame shifts the histogram. PySceneDetect's `HistogramDetector` is exactly this (HSV, correlation distance).
**Determinism:** full.
**Accuracy anchor (PySceneDetect own benchmark, frame-exact tolerance=0):** HistogramDetector F1 **79.96** BBC / **57.82** AutoShot — *below* ContentDetector and well below AdaptiveDetector. So histograms are robust but not the accuracy leader.
**Citations:** Boreczky & Rowe 1996; Gargi, Kasturi & Strayer, *Performance characterization of video-shot-change detection methods*, IEEE TCSVT 2000.
**Verdict for us:** a solid robustness upgrade over raw MAFD, but on its own it leaves accuracy on the table and still needs a thresholding scheme. Better as the *base signal* under §2.6 than as the whole answer.

### 2.3 Edge Change Ratio (ECR) — *motion-compensated, but fragile*

**Signal:** Canny edge maps per frame; after estimating and compensating global translation, measure the fraction of edge pixels entering vs exiting: `ECR = max(ρ_in, ρ_out)`. PySceneDetect approximates this cheaply as the `delta_edges` weight (edge maps + dilation tolerance band) added in v0.6.1 specifically *"to compensate for motion within the frame."*
**Motion robustness: good for pans** (explicit registration / dilation band absorbs translation), **but**: zooms change edge *scale* not position (translation-compensation doesn't cancel them → false positives); motion blur destroys edges (false negatives); noise- and Canny-threshold-sensitive; expensive.
**Determinism:** full given fixed Canny + deterministic motion estimation.
**Citations:** Zabih, Miller & Mai, *A feature-based algorithm for detecting and classifying scene breaks*, ACM Multimedia 1995; Lienhart, *Reliable transition detection in videos*, IJIG 2001 (reports ECR underperforming histograms in practice); Gargi et al. 2000.
**Verdict for us:** useful as an *add-on* (the `delta_edges` lever) if pans still leak after §2.6, **not** as the primary detector — its zoom/blur fragility and cost don't justify first-pick status.

### 2.4 Twin-comparison / dual-threshold — *a thresholding scheme, not a signal*

**Mechanism:** wrap any difference signal with two thresholds. `Tb` (high) → declare a hard cut immediately. `Tw < D ≤ Tb` → start *accumulating*; if the accumulation reaches `Tb` over a sustained run, it was a gradual transition; if `D` falls back below `Tw` first, discard (it was a transient). The **motion guard** falls out naturally: a flash is a 1–2 frame spike whose accumulation never reaches `Tb` → suppressed.
**Motion robustness:** good against *flashes and brief motion* (transient, resets). **Leaks on monotonic long pans/zooms** whose accumulated change legitimately reaches `Tb` (it looks like a dissolve). Best paired with a histogram base, not pixels.
**Determinism:** full (with fixed or adaptive-but-deterministic `Tb`/`Tw`).
**Citations:** Zhang/Kankanhalli/Smoliar 1993 (origin); Hanjalic, *Shot-boundary detection: unraveled and resolved*, IEEE TCSVT 2002 (statistical/adaptive thresholding formalization); Lienhart 2001.
**Verdict for us:** the *idea* (sustained vs transient) is exactly right and is subsumed by the adaptive-ratio method (§2.6), which is the modern, self-calibrating embodiment.

### 2.5 Motion-compensated residual — *theoretically strongest*

**Mechanism:** estimate the dominant inter-frame transform (pan=translation, zoom=scale) via block matching or optical flow; warp *f−1* to align with *f*; measure the **residual** after alignment. A pan/zoom is well-described by a global transform → residual collapses to ~0. A cut has no warp that maps shot A→B → residual stays large. The robust variant uses the *likelihood ratio* of motion-compensated blocks (IEEE, *A robust scene-change detection method for video segmentation*).
**Motion robustness: best** — it literally removes camera motion from the signal. This is the only method that targets the *cause* rather than a symptom.
**Determinism:** full given deterministic motion estimation (fixed search pattern, no randomized seeds).
**Cost:** highest — needs a motion-estimation library or per-block search, per frame. Heavy for a Node/ffmpeg box; ffmpeg does not expose per-frame global-motion residual as a filter metadata value.
**Citations:** *Moving Object Detection in Freely Moving Camera via Global Motion Compensation* (PMC11086171); IEEE *974682* (likelihood-ratio of MC blocks); arXiv:1004.4605 (motion-activity descriptor).
**Verdict for us:** correct but disproportionate. We'd be building/porting motion estimation to shave the residual error that the adaptive ratio already handles statistically. Park it unless §4 shows pans dominate the remaining error.

### 2.6 Adaptive threshold / rolling-ratio (PySceneDetect AdaptiveDetector) — *the recommended lever*

**Mechanism (verified verbatim against `adaptive_detector.py`):** compute an ordinary per-frame content score, then divide by the mean of neighbouring frames' scores over a window:

```
average_window_score = (Σ neighbour scores in ±window_width, excluding centre) / (2·window_width)
adaptive_ratio       = min(target_score / average_window_score, 255.0)   # guard: if avg≈0 and score≥min, ratio=255
cut  ⇔  adaptive_ratio ≥ adaptive_threshold
        AND target_score ≥ min_content_val
        AND (time − last_cut) ≥ min_scene_len
```

**Defaults (v0.7):** `adaptive_threshold=3.0`, `window_width=2`, `min_content_val=15.0`, `min_scene_len=15`.

**Why it rejects motion — and this is the key insight for our MrBeast problem:** during a sustained pan/zoom/action plateau, *every* frame in the window has a high raw score, so the denominator is *also* high → the ratio stays ≈1 and never reaches 3×. A real cut is a **single** frame towering over quiet neighbours → ratio explodes. The dual gate matters: `adaptive_ratio≥3` kills the motion *plateau*; `target_score≥min_content_val` kills the opposite failure (a tiny score in an even-quieter neighbourhood producing a huge *ratio* in a near-static scene — the divide-by-near-zero case). The origin issue (#153, *"Reduce false positives in ContentDetector due to camera movement"*) documents the exact pathology: under a fixed threshold, *"actual cuts scored only 9–10 while false positives from camera movement exceeded 10"*; the ratio inverts that because the false positives are surrounded by similarly-high frames and the true cuts are not.

**Motion robustness: strong and self-normalizing per-video** — no magic absolute constant that breaks across bright/dark or calm/action content. This is the property a content-agnostic calibration pipeline needs.
**Determinism:** full (single-threaded fixed arithmetic).
**Accuracy anchor (PySceneDetect benchmark, tolerance=0):** AdaptiveDetector F1 **91.59** BBC (precision **96.55**) / **73.86** AutoShot — best of all PySceneDetect detectors on both datasets, beating ContentDetector (86.69 / 69.26) and HistogramDetector (79.96 / 57.82).

**Adversarial caveat (load-bearing — do not skip):** the claim that AdaptiveDetector *"reliably"* suppresses motion false-positives is **overstated**. Our own adversarial review (Claim 1) found every authoritative source *hedges*: the docs say *"can help mitigate … in some cases"*; the contributor who built it said results are *"still not perfect."* It is **directionally correct and the best deterministic lever available**, but it is **not** a guarantee — sustained motion the window itself absorbs, or motion shorter than the window, can still leak, and **no public benchmark quantifies its false-positive rate on MrBeast-class content.** Therefore we adopt it *and* validate on our own footage (§4) rather than trusting the F1 numbers above, which are dominated by broadcast/short-form data, not creator high-motion vlogs.

**Citations:** PySceneDetect `adaptive_detector.py` + docs (scenedetect.com/docs/latest/api/detectors.html); issue #153; discussion #296 (delta_edges).

### 2.7 Learned-deterministic (TransNetV2 / AutoShot) — *accuracy ceiling, wrong tool here*

**Mechanism:** dilated-3D-CNN over 100-frame 48×27 windows; deterministic forward pass (fixed weights, no sampling).
**Accuracy:** SOTA — TransNetV2 F1 **77.9** ClipShots / **96.2** BBC / **93.9** RAI; trained explicitly on dissolves so it's the *only* option strong on graduals. AutoShot beats it slightly (+1–4 F1).
**Determinism:** model-level deterministic; end-to-end can vary with ffmpeg frame-extraction and GPU/driver/cuDNN — pin the runtime.
**Adversarial caveat (Claim 3):** the "materially better on motion-heavy content" claim is **PARTIALLY SUPPORTED / UNCERTAIN.** The measured edge over deep baselines on the *diverse* dataset (ClipShots) is only ~2 F1; **no paper reports a motion-stratified comparison vs adaptive thresholding**; the paper admits *"fast abrupt changes … can still confuse even state-of-the-art models."* Its motion robustness is *incidental* (learned), not designed.
**Integration cost for us: high and disqualifying for the calibration box.** Requires Python + TF or PyTorch + (ideally) GPU; **no first-party ONNX** (community `transnetv2-pytorch` exists but no maintained ONNX file → you'd own the `torch.onnx.export`); no native Node binding → a Python sidecar with heavy CUDA deps. On a Windows box that already throws `STATUS_DLL_INIT_FAILED` from ffmpeg under memory pressure, adding a multi-GB DL runtime is the wrong bet.
**Citations:** Souček & Lokoč, *TransNet V2*, arXiv:2008.04838 + repo (MIT); Zhu et al., *AutoShot*, CVPR-W 2023, arXiv:2304.06116.
**Verdict for us:** **not now.** Revisit only if (a) §4 shows the deterministic counter caps out below target precision/recall on creator content *and* (b) gradual transitions turn out to matter for the calibration signal. It would also make a far better **offline ground-truth oracle** (§4) than a production dependency.

### 2.8 Landscape summary

| Method | Motion-robust | Determ. | Accuracy anchor (F1) | Node+ffmpeg+Win cost | Role for us |
|---|---|---|---|---|---|
| MAFD / `scene` (current) | ✗ worst | ✓ | — (over/under-counts) | already wired | raw signal only |
| Colour histogram | ✓ good | ✓ | 80/58 (BBC/AutoShot) | low (in-code or PSD) | base signal candidate |
| ECR / `delta_edges` | pans ✓, zoom/blur ✗ | ✓ | n/a (add-on) | medium | optional add-on |
| Twin-comparison | flashes ✓, long pan ✗ | ✓ | scheme, not scored | low (in-code) | subsumed by §2.6 |
| Motion-comp residual | ✓ best | ✓ | n/a | high (no ffmpeg metadata) | park unless pans dominate |
| **Adaptive rolling-ratio** | **✓ strong (hedged)** | **✓** | **92/74 (best of PSD)** | **low** | **recommended** |
| TransNetV2 / AutoShot | ✓ (incidental) | ✓ (pin runtime) | 78/96/94 (SOTA) | **high (GPU/Python/no ONNX)** | offline oracle / future |

---

## 3. Ranked recommendation for `calibrate.ts`

### Recommendation 1 (primary, ship this): single ffmpeg `scdet` metadata pass → in-code AdaptiveDetector-style rolling-ratio + explicit local-maximum gate

**One sentence:** replace the three thresholded `select=gt(scene,T)` passes with **one** `scdet`-metadata pass that emits *every* frame's score, then make the cut decision in Node using the verified AdaptiveDetector ratio (`score / rolling-neighbour-mean ≥ R`, gated by a floor and a min-separation), with an added local-maximum/dominance gate.

**Why this and not the others (ranked rationale):**

1. It targets the exact failure (motion plateau) with the method whose accuracy anchor is best among deterministic, no-ML options (F1 92 BBC), while staying inside the existing Node+ffmpeg toolchain — **no new runtime, no GPU, no DLL surface added** (decisive given the box's `STATUS_DLL_INIT_FAILED` history).
2. It is **self-normalizing per video**, which is the only way one config serves both MrBeast and screencast — the thing no fixed `T` can do.
3. It collapses three ffmpeg passes into one (≈3× faster scene-detect, and removes the very memory-pressure window that the retry-loop at line 403 exists to paper over).
4. It is **fully in our code**, so the parameters are *ours* to calibrate against *our* footage (§4) — we are not trusting PySceneDetect's broadcast-tuned defaults blind, which the adversarial verdict says we must not.

**Concrete shape (replaces lines 395-456, `detectReferenceEditingFromLocalVideo`):**

*Pass (one ffmpeg invocation, all frames scored):*
```
ffmpeg -hide_banner -nostats -i <local> \
  -vf "scdet=threshold=0,metadata=print:file=-" \
  -an -f null -
```
- `scdet=threshold=0` makes ffmpeg annotate **every** frame (it flags nothing — *we* decide). This is the verified single-pass trick (Claim 2: **SUPPORTED**; confirmed against the `metadata` filter docs and the Jpja/FFmpeg-Detect-Copy-Motion production tool). `metadata=print:file=-` streams `lavfi.scd.score` (0–100), `lavfi.scd.mafd`, `lavfi.scd.time` to a parseable stream.
- **Windows note:** `file=-` writes to ffmpeg's stdout; capture `result.stdout`. If `-` routing is flaky in a given ffmpeg build, write to a temp file (`metadata=print:file=<tmp>.txt`) and read it — both are deterministic. Keep `-an` (audio decode is pure waste here and a DLL we don't need to load).

*Parse (extend `parseFfmpegSceneDetectionOutput`, line 323):* parse paired `lavfi.scd.time=<s>` and `lavfi.scd.score=<0..100>` into an ordered `Array<{ms, score}>`. (Keep the existing `pts_time` parser as a fallback for the `showinfo` path so we can A/B old-vs-new in §4.)

*Decide (new pure function — this is the whole fix):*
```
For each frame i with score s_i:
  win   = scores[i-W .. i+W] excluding i
  avg   = mean(win)
  ratio = avg > EPS ? min(s_i/avg, 255) : (s_i >= MIN_SCORE ? 255 : 0)
  isLocalMax = s_i >= max(win)                         // explicit peak gate (§2.7 classic)
  dominates  = s_i >= SECOND_LARGEST(win) * DOM        // beats the runner-up by a factor
  cut ⇔ ratio >= R AND s_i >= MIN_SCORE AND isLocalMax AND dominates
        AND (t_i - lastCutMs) >= MIN_SEP_MS
```

**Parameters — every one marked with its source per Rule E4/E31. None are production-final; §4 calibrates them on our footage:**

| Param | Starting value | Source | Notes |
|---|---|---|---|
| `W` (window half-width, frames) | `2` | ← PySceneDetect AdaptiveDetector default (`window_width=2`), verified in source | ±2 frames each side |
| `R` (ratio threshold) | `3.0` | ← PySceneDetect default (`adaptive_threshold=3.0`) | the motion-plateau killer |
| `MIN_SCORE` (score floor, 0–100) | `8.0` ⚠️ **needs validation** | ← FFmpeg `scdet` docs cite "good values in [8.0,14.0]" for the *fixed* threshold; reused here only as a floor | scdet scale is 0–100, **not** the 0–1 of `select` — do **not** transplant 0.25/0.35/0.45 |
| `DOM` (dominance over runner-up) | `1.5` ⚠️ **INVENTED** | domain heuristic — a true cut should beat its loudest neighbour by ~50% | calibrate; could be 1.2–2.0 |
| `MIN_SEP_MS` | `220` | ← **existing** `MIN_REFERENCE_CUT_SEPARATION_MS` (line 207) — keep, it's already ours | maps to ~6–7 frames @30fps, consistent with PSD `min_scene_len=15`@... (verify fps) |
| `EPS` | `1e-5` | ← PySceneDetect divide-by-zero guard, verbatim | |

> ⚠️ **Threshold honesty:** `MIN_SCORE=8` and `DOM=1.5` are the two numbers I am least sure of. The scdet 0–100 scale is genuinely different from the `select` 0–1 scale, so the floor must be re-derived, not copied. Ship them as *defaults behind the validation harness*, not as truth.

**What we delete and why:** the three-threshold sweep (line 402) and the `selectDeterministicReferenceCandidate` consensus filter (lines 338-393) go away. The consensus filter is not just redundant — it is **actively counterproductive** on motion (§1.2): three thresholds on one MAFD signal agree *most strongly* exactly when a pan is happening, so "≥2 agree" rubber-stamps the false positive. The rolling ratio replaces correlated-threshold "consensus" with genuine temporal context.

**Integration effort: ~half a day.** It is one new pure function + a parser extension + deleting the sweep/consensus code. The pure function is trivially unit-testable (synthetic score series: a spike vs a plateau vs a flash → assert cut/no-cut), which is the right place to lock behaviour before touching real video. tsc/eslint clean is the bar (Override #4).

**Residual risk (honest):** if creator content has *ramping* motion (a pan that starts slowly and accelerates), the rolling mean lags and a frame mid-ramp can momentarily dominate its (still-lower) trailing neighbours. The `isLocalMax AND dominates` gate mitigates this but does not eliminate it. This is precisely what §4 must measure on MrBeast before we trust the count.

### Recommendation 2 (fallback if R1 underperforms on pans): shell out to PySceneDetect `detect-adaptive`

If §4 shows R1 still over-counts on pans/zooms beyond target, escalate to the reference implementation **with edge motion-compensation enabled**, as a subprocess:

```
scenedetect -i <local> -d <downscale> detect-adaptive --weights 1 1 1 1 list-scenes -o <dir>
```
then parse `*-Scenes.csv`. `--weights 1 1 1 1` turns on `delta_edges` (§2.3) — the structure-aware, motion-tolerant channel — on top of the ratio, which is the single lowest-effort way to get *all three* robustness mechanisms (ratio + edges + min-scene-len) at once.

**Tradeoffs vs R1:**
- **+** Battle-tested; the ratio + edge-compensation are already implemented and benchmarked (F1 92 BBC). Removes our `DOM`/`MIN_SCORE` tuning burden.
- **+** Windows-friendly install: PySceneDetect ships an **MSI / portable ZIP**, so `child_process.spawn('scenedetect', …)` needs **no Python on the box** (verify the portable build is on the calibration machine; otherwise `pip install scenedetect[opencv]`).
- **−** Adds a process + OpenCV/decoder dependency to pin (determinism is "within a fixed environment" — pin the version, per Claim's caveat).
- **−** Less control over the exact decision than our own function; CSV parsing instead of a pure TS function we can unit-test in isolation.
- **Effort:** low (~half a day incl. install verification + CSV parse), but it *adds a runtime* — which is exactly the cost R1 avoids. Hence fallback, not primary.

### Recommendation 3 (do **not** do now): TransNetV2 sidecar

Disqualified for the calibration box: Python+TF/PyTorch+GPU, no first-party ONNX, no Node binding, and the "materially better on motion content" claim is unproven vs adaptive thresholding (Claim 3 = UNCERTAIN). **Better future use:** as the **offline ground-truth oracle** in §4 (run it once on the reference set on a GPU machine to seed labels), not as a per-calibration-run dependency.

### Ranked summary

1. **R1 — in-code rolling-ratio + local-max over one `scdet` pass.** Best fit: deterministic, motion-robust, zero new runtime, parameters we own. **Ship.**
2. **R2 — PySceneDetect `detect-adaptive --weights 1 1 1 1` subprocess.** Escalation if pans still leak; adds a runtime but removes tuning burden.
3. **R3 — TransNetV2.** Not now; use as offline oracle only.

---

## 4. How to validate the new cut count

**You cannot ship any of §3 without this.** The whole reason we're here is that "the number looked plausible" was wrong (728 ≠ 50). Per Rule 34, "works" means *measured against ground truth on our footage*, not "imports and emits a number."

### 4.1 Build a labelled ground-truth set (the oracle)

- **Dataset:** the existing `scripts/calibrate/reference-videos.json` set — these are the videos calibration actually runs on, so their cut counts are what matter. Cover the failure modes explicitly: ≥1 MrBeast-class high-motion vlog, ≥1 screencast/tutorial, ≥1 talking-head, ≥1 cinematic-slow, ≥1 music-driven montage. **Minimum 8 clips across content types** (Rule 29 adversarial breadth). Use 60–120 s excerpts so hand-labelling is tractable.
- **Ground-truth cuts:** two independent sources, reconciled:
  1. **Human frame-level labels** — step through in an NLE/`ffmpeg`-extracted frames; mark every hard-cut frame. This is the gold standard (~30 min per 2-min clip; do the 8). Per the MEMORY directive, human ground truth is *mandatory* — VLM/auto labels alone run ~32–34% agreement and are lenient.
  2. **TransNetV2 (R3) run once on a GPU box** as a *second opinion* to catch cuts the human missed; reconcile disagreements by eye. (This is the one good use of TransNetV2 here.)
- Store as `{videoLabel, cutFramesMs: number[]}`. Commit it (it's the regression fixture). **Do not** `git add` the whole `scripts/` dir (MEMORY footgun: Mongo URI lives in untracked scripts) — add the single JSON path explicitly.

### 4.2 Scoring method — use the TRECVID protocol, exactly

Match detected cuts to reference cuts with a **tolerance window**, then compute precision/recall/F1. This is the load-bearing detail the current code lacks entirely.

- **Match rule:** a detected cut counts as a true positive if it falls within **±N frames** of a reference cut (TRECVID expands each abrupt reference by ±5 frames; a single-frame overlap suffices). Use **±5 frames (~±167 ms @30fps)** so detection error isn't conflated with localization error.
- **Per clip and aggregate:**
  - Recall = TP / (reference cuts) — measures **misses** (the screencast under-count shows up here).
  - Precision = TP / (detected cuts) — measures **false alarms** (the MrBeast over-count shows up here, brutally — 50 TP / 728 detected = 0.069 precision today).
  - F1 = 2PR/(P+R).
- **Score cuts only** (graduals out of scope, §1.4). If a reference transition is a dissolve, exclude it from both sets rather than penalizing the deterministic counter for correctly ignoring it.
- **Flash guard check:** explicitly include a clip with camera flashes / strobes (or a montage) and confirm precision doesn't collapse — flashes are the classic killer (one TRECVID clip had >500 luminance spikes/minute). If R1 over-fires on flashes, add the before/after symmetry post-filter (compare ~2 frames pre vs ~2 frames post a candidate; if before≈after by histogram, it was a flash → drop). Keep that as a *documented optional stage*, not default, until the data demands it.

### 4.3 Targets ("what good looks like" — calibrated to honest, evidence-based bands)

These come straight from the TRECVID per-type best-run table and the modern leaderboards (§2), adjusted for content type:

| Content class | Recall target | Precision target | F1 target | Source for the bar |
|---|---|---|---|---|
| Talking-head / cinematic-slow (clean) | ≥0.92 | ≥0.92 | **≥0.90** | TRECVID best-run cuts F≈0.91–0.95; broadcast is "solved" |
| Screencast / tutorial | ≥0.85 | ≥0.90 | **≥0.87** | our specific under-count failure — recall is the watch metric |
| MrBeast-class high-motion vlog | ≥0.80 | ≥0.80 | **≥0.80** | in-the-wild SOTA (ClipShots/AutoShot) is F≈0.78–0.84 — **do not expect 0.95** |
| **Aggregate gate to ship R1** | — | — | **≥0.85 macro-F1, AND no clip <0.70** | Rule 29: one damage-8 failure mode (a clip at 0.07 precision) = not production-grade |

**The single most important acceptance test:** MrBeast detected-cut count must land in a sane band vs the ~50 human-labelled cuts (say **35–70**, i.e. within ~±40%), and screencast recall must clear 0.85. If R1 hits aggregate F1 but MrBeast precision is still <0.5, **do not ship — escalate to R2.** (This is exactly the Rule 32 "don't lower the bar to make it pass" discipline.)

### 4.4 Harness mechanics

- A standalone `scripts/calibrate/eval-cut-detection.ts` (Rule 35: *eval harness FIRST*) that: takes `{videoLabel → cutFramesMs}` ground truth + a detector function, runs the detector on each cached clip in `.calibration-temp`, computes the §4.2 metrics, prints a per-clip + aggregate table. Deterministic, no bandit writes, `--dry-run`-style.
- Run it as **A/B**: old `select`-consensus detector vs new `scdet`-ratio detector, same clips, same ground truth, side-by-side. This is the proof that R1 actually beats the status quo, not just "produces a number."
- Lock the winning params into `calibrate.ts` only after the table clears §4.3. Record the exact params + their measured F1 in the commit message (Rule 31: every number has a source).

---

## 5. Open questions / honest uncertainties

1. **scdet 0–100 floor (`MIN_SCORE`).** The biggest unknown. The 0–1 `select` thresholds do not transfer to the 0–100 `scdet` scale, and "[8,14] good values" is for a *fixed* threshold, not a floor under a ratio. The right floor is whatever §4 shows separates real cuts from intra-shot peaks on *our* footage — likely lower than 8 once the ratio gate is doing the heavy lifting. **Must be measured, not assumed.**
2. **`DOM` and whether the local-max gate is even needed.** The pure adaptive ratio (R2/PySceneDetect) ships *without* an explicit local-max gate and scores F1 92. My added `isLocalMax AND dominates` gate (§3 R1) is a belt-and-suspenders for ramping motion that may be *over*-engineering. §4 should A/B "ratio only" vs "ratio + local-max" — if the gate doesn't move precision on the MrBeast clip, drop it (simpler is better; Rule 17N).
3. **Ramping / accelerating pans.** The known theoretical leak of the rolling-mean approach (§3 residual risk). Unquantified on creator content. If §4 shows this dominates the residual error, that is the *one* signal that would justify escalating to motion-compensation residual (§2.5) — which is the only method that addresses it at the cause.
4. **fps assumption.** `MIN_SEP_MS=220` and the ±5-frame match window assume ~30fps. Reference videos may be 24/25/60fps. The window logic must read actual fps (ffprobe, already available via `detectLocalDurationMs`'s ffprobe call) and convert, or the separation floor silently means different frame counts across clips.
5. **Does the count even need to be this good?** The downstream consumer is `normalizeCutsPerMinuteToPacingVelocity` (line 834), which buckets `cutsPerMinute` into coarse bands (≤4, ≤8, ≤18, ≤30). A count of 50 vs 60 both land in "≤18→high pacing"; 728 vs 50 do not. So the *practical* bar may be "get the order of magnitude right and land in the correct pacing bucket," which is **much** easier than frame-accurate F1. **Recommend:** in §4, also report "did the clip land in the correct pacing-velocity bucket?" as the *business* metric alongside F1 — it may show R1 is more than good enough even where F1 is mediocre, which would let us ship sooner and not over-invest in cut-detection precision the bandit can't even perceive.
6. **Determinism across ffmpeg builds.** scdet output is deterministic for a *given* ffmpeg build + decode path; a Windows ffmpeg upgrade could shift scores at the margin. Pin the ffmpeg version on the calibration box, or store the ffmpeg version alongside calibration runs so a shift is attributable (Rule 34).
7. **Gemini-merge interaction.** `mergeReferenceEditingEvidence` (line 458) still overlays Gemini's *semantic* transition *types* onto the deterministic *timing*. R1 changes the timing source but the merge logic is unaffected — verify the `transitionTypes` join (the ±900 ms match, line 488) still behaves when the deterministic cut list is cleaner/sparser. Low risk, but in the blast radius.

---

### Bottom line

Adopt **Recommendation 1**: one `scdet` `metadata=print` pass feeding an in-code AdaptiveDetector-style rolling-ratio decision (params seeded from PySceneDetect's verified defaults, `MIN_SCORE`/`DOM` flagged as needing calibration), deleting the counter-productive three-threshold consensus filter. It is the only option that is simultaneously deterministic, motion-robust, and free of new runtime/GPU/DLL surface on a Windows Node+ffmpeg box. **Gate the ship on §4**: TRECVID-protocol precision/recall/F1 on ≥8 hand-labelled clips spanning the failure modes, with hard targets (aggregate F1 ≥0.85, no clip <0.70, MrBeast count in 35–70). Keep PySceneDetect `detect-adaptive --weights 1 1 1 1` as the documented fallback if pans still leak, and TransNetV2 as an offline ground-truth oracle — not a production dependency. The honest risk is ramping motion and the un-calibrated 0–100 floor; both are *measurable* in §4 and neither is a reason to delay building the harness, which is the true first step.

**Relevant files (absolute):**
- Target to modify: `D:\google downloads\Front-End-main\editron-worktree\scripts\calibrate\calibrate.ts` — current detector at lines 395-456, consensus filter 338-393, parser 323-331, thresholds line 206-208, pacing consumer 834-860.
- New harness to create: `D:\google downloads\Front-End-main\editron-worktree\scripts\calibrate\eval-cut-detection.ts` (does not yet exist — confirmed via Glob).