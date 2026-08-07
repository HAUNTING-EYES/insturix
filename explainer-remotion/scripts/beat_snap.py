# Beat-grid snapping for the AI-generated explainer path.
#
# WHY THIS EXISTS
# The generated film is timed ONLY to narration length (glm-voice-fit): each scene is as long as its VO
# line, so cuts land wherever a sentence happens to end — almost never on a musical beat. The
# hand-authored films are different: they are authored on a BPM grid (src/timing.ts), which is exactly
# why their cuts feel locked to the track. This module gives the generated path the same property:
# snap each seam to the music's MEASURED beat grid, while never shortening a scene below its VO
# (audio-first remains the invariant — narration is never truncated).
#
# THE PART NAIVE BEAT-SNAPPING GETS WRONG (from the creative knowledge graph):
#   signal:audio.music_beat              "4+ consecutive cuts on exact beat positions -> metronomic flag"
#   constraint:temporal.metronomic_beat_sync
#       "6+ consecutive cuts within +/-1 frame of beat = strongest 'AI edited this' tell"
#       autoCorrection: "apply humanize jitter +/-2-3 frames (seeded by projectId)"
#       rationale:      "perfect machine-locked cuts ... Human rhythm breathes. Pearlman's pulse theory —
#                        syncopation is life, metronomic precision is death"   (deduction -5, ANTI_PATTERN)
#   threshold-registry: metronomic-beat-count = 6 (source 'crg')
# A 6-scene film snapped naively would put EVERY cut on an exact beat — i.e. it would ship the exact
# anti-pattern the graph flags. So exact-beat runs are capped and then humanized.
#
# Jitter is DETERMINISTIC (hashlib seeded by the video id). Never random()/hash(): Python's hash() is
# salted per process and random() is unseeded — both would make renders non-reproducible, and Remotion
# requires the same frame to produce the same pixels on every run.

import hashlib
import math

MAX_EXACT_RUN = 3        # stay UNDER signal:audio.music_beat's "4+ -> metronomic flag" (constraint fires at 6)
JITTER_MIN_FRAMES = 2    # CKG autoCorrection: "humanize jitter +/-2-3 frames"
JITTER_MAX_FRAMES = 3


def humanize_jitter(seed: str, index: int) -> int:
    """Deterministic +/-2..3 frame offset for the cut at `index`. Same (seed, index) -> same value."""
    h = hashlib.sha256(('%s:%d' % (seed, index)).encode('utf-8')).digest()
    span = JITTER_MAX_FRAMES - JITTER_MIN_FRAMES + 1
    magnitude = JITTER_MIN_FRAMES + (h[0] % span)
    return magnitude if (h[1] & 1) else -magnitude


def snap_durations(min_frames, fps, transition_frames, beat_period_sec, first_beat_sec, seed=''):
    """Return per-scene durations (whole frames) whose seams land on the music's beat grid.

    min_frames        : minimum frames each scene needs (its VO length + pad) — never violated
    transition_frames : crossfade length; scene i+1 starts at S_i + d_i - T, so the viewer perceives
                        the change at the crossfade MIDPOINT — that midpoint is what we align
    beat_period_sec / first_beat_sec : the grid, MEASURED from the actual track (detect-bpm.mjs)
    seed              : stable per-video string (video id) so jitter is reproducible

    Falls back to plain ceil(min) when there is no usable grid, so a detection failure degrades to
    exactly today's behaviour rather than breaking the render.
    """
    n = len(min_frames)
    beat = float(beat_period_sec) * float(fps)
    phase = float(first_beat_sec) * float(fps)
    trans = float(transition_frames)
    if n == 0 or beat <= 1.0:
        return [int(math.ceil(float(m))) for m in min_frames]

    def next_beat(x):
        """Smallest grid position >= x. (1e-9 guards float error when x is already exactly on a beat.)"""
        k = math.ceil((x - phase) / beat - 1e-9)
        return phase + k * beat

    durations = []
    start = 0.0      # current scene's start frame
    exact_run = 0    # consecutive cuts landing exactly on a beat
    for i, raw_min in enumerate(min_frames):
        minimum = float(raw_min)
        is_last = i == n - 1
        # The moment the change is perceived: the crossfade midpoint (or, for the last scene, the film end).
        anchor_floor = start + minimum if is_last else start + minimum - trans / 2.0
        anchor = next_beat(anchor_floor)
        on_beat = True

        if exact_run >= MAX_EXACT_RUN:
            offset = humanize_jitter(seed, i)
            if anchor + offset < anchor_floor:
                offset = abs(offset)      # pulling earlier would eat the VO — push later instead
            anchor += offset
            on_beat = False

        duration = anchor - start + (0.0 if is_last else trans / 2.0)
        frames = int(round(duration))
        floor_frames = int(math.ceil(minimum))
        if frames < floor_frames:         # safety net: VO length always wins over the grid
            frames = floor_frames
            on_beat = False

        durations.append(frames)
        exact_run = exact_run + 1 if on_beat else 0
        start = start + frames - trans

    return durations


def cut_positions(durations, transition_frames):
    """Frame positions the viewer perceives as cuts — crossfade midpoints, plus the film end.
    Used by the tests (and useful for logging) to prove the seams really land on the grid."""
    trans = float(transition_frames)
    cuts = []
    start = 0.0
    for i, d in enumerate(durations):
        if i < len(durations) - 1:
            cuts.append(start + d - trans / 2.0)
        else:
            cuts.append(start + d)
        start = start + d - trans
    return cuts
