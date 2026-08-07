# Regression tests for beat_snap — pure math, no network, no model calls, no cost.
#   python scripts/test_beat_snap.py
#
# Guards the three things that must never regress:
#   1. narration is never truncated (VO floor wins over the grid)
#   2. seams actually land on the measured beat grid
#   3. we never ship the metronomic anti-pattern (4+ consecutive exact-beat cuts)
import math
import sys

from beat_snap import MAX_EXACT_RUN, cut_positions, snap_durations

FPS = 60
T = 22                    # transitionFrames used by the generated plan
BEAT_SEC = 0.441          # measured from public/music.mp3 (scripts/detect-bpm.mjs -> 136 BPM)
PHASE_SEC = 0.058         # first beat offset, same measurement
BEAT_F = BEAT_SEC * FPS

# Realistic VO-fitted minimums (seconds -> frames), incl. the 2.6s floor and a long 5.3s line.
CASES = {
    'typical 6-scene': [3.5, 3.9, 6.5, 3.9, 2.6, 2.6],
    'all-short (floor)': [2.6, 2.6, 2.6, 2.6, 2.6, 2.6],
    'long lines': [5.3, 6.5, 4.7, 5.9, 4.1, 3.3],
    'single scene': [4.0],
    'two scenes': [3.0, 3.0],
    'many scenes (12)': [2.6, 3.1, 4.2, 2.6, 3.8, 2.9, 5.1, 2.6, 3.4, 4.6, 2.6, 3.0],
}

failures = []


def check(label, condition, detail=''):
    if condition:
        print('  PASS  %s' % label)
    else:
        print('  FAIL  %s %s' % (label, detail))
        failures.append(label)


def on_grid(pos):
    """Is this cut position on a beat (within half a frame — i.e. sub-10ms at 60fps)?"""
    k = round((pos - PHASE_SEC * FPS) / BEAT_F)
    return abs((PHASE_SEC * FPS + k * BEAT_F) - pos) <= 0.5


for label, secs in CASES.items():
    mins = [s * FPS for s in secs]
    durs = snap_durations(mins, FPS, T, BEAT_SEC, PHASE_SEC, seed='vTEST123')
    cuts = cut_positions(durs, T)

    print('\n%s  (%d scenes)' % (label, len(secs)))
    # 1. VO is never truncated
    check('VO floor respected', all(d >= math.ceil(m) for d, m in zip(durs, mins)),
          str([(d, math.ceil(m)) for d, m in zip(durs, mins) if d < math.ceil(m)]))
    # 2. cuts land on the grid (jittered ones are the deliberate exception)
    aligned = [on_grid(c) for c in cuts]
    check('most cuts on the beat grid', sum(aligned) >= max(1, len(cuts) - (len(cuts) // (MAX_EXACT_RUN + 1)) - 1),
          'aligned=%d/%d' % (sum(aligned), len(cuts)))
    # 3. the metronomic anti-pattern never ships
    longest = run = 0
    for a in aligned:
        run = run + 1 if a else 0
        longest = max(longest, run)
    check('no metronomic run (<4 consecutive exact)', longest <= MAX_EXACT_RUN, 'longest run=%d' % longest)
    # 4. scenes only ever GROW (snapping must not steal time from a scene)
    check('durations >= un-snapped baseline', all(d >= math.ceil(m) for d, m in zip(durs, mins)))
    print('        durations: %s' % durs)
    print('        cuts@beats: %s' % ['%.1f%s' % (c, '' if a else ' (humanized)') for c, a in zip(cuts, aligned)])

# 5. determinism — same inputs must give identical output every run (Remotion reproducibility)
mins = [s * FPS for s in CASES['typical 6-scene']]
a = snap_durations(mins, FPS, T, BEAT_SEC, PHASE_SEC, seed='vSEED')
b = snap_durations(mins, FPS, T, BEAT_SEC, PHASE_SEC, seed='vSEED')
c = snap_durations(mins, FPS, T, BEAT_SEC, PHASE_SEC, seed='vOTHER')
print('\ndeterminism')
check('same seed -> identical durations', a == b, '%s vs %s' % (a, b))
check('different seed -> different humanization', a != c or len(a) < MAX_EXACT_RUN + 1)

# 6. graceful degradation — no usable grid must reproduce today's behaviour exactly
print('\ndegradation (no grid)')
plain = snap_durations(mins, FPS, T, 0, 0, seed='x')
check('falls back to ceil(min) unchanged', plain == [int(math.ceil(m)) for m in mins], str(plain))
check('empty input safe', snap_durations([], FPS, T, BEAT_SEC, PHASE_SEC) == [])

print('\n%s' % ('ALL PASS' if not failures else 'FAILURES: %s' % failures))
sys.exit(1 if failures else 0)
