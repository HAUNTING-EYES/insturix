# MUX step. Assumes scripts/glm-voice-fit.py already synthesized out/vo/glm/*.mp3 and fitted scene durations
# (so each scene is >= its VO). Places each VO line at its scene start, ducks music under the voice, muxes onto
# the render. Output: out/film-glm-final.mp4
import json, os, subprocess

SILENT = 'out/film-glm.mp4'
MUSIC = 'public/music-leskea.mp3'
OUT = 'out/film-glm-final.mp4'
LEAD = 0.12  # start the line just after the scene cut, not exactly on it

plan = json.load(open('out/plan.json', encoding='utf-8'))
fps, T, scenes = plan['fps'], plan['transitionFrames'], plan['scenes']

starts, acc = [], 0
for i, s in enumerate(scenes):
    starts.append(max(0, acc - T * i))
    acc += s['durationInFrames']
film_sec = (acc - T * max(0, len(scenes) - 1)) / fps

clips = []
for i, s in enumerate(scenes):
    p = 'out/vo/glm/%d.mp3' % i
    if (s.get('vo') or '').strip() and os.path.exists(p):
        clips.append((p, starts[i] / fps + LEAD, s['vo']))

print('film=%.2fs; placing %d VO lines:' % (film_sec, len(clips)))
for _, t, vo in clips:
    print('  @%5.2fs  %s' % (t, vo))

inputs = ['-i', SILENT, '-i', MUSIC]
for p, _, _ in clips:
    inputs += ['-i', p]

fc, labels = [], []
for k, (_, start_sec, _) in enumerate(clips):
    ms = round(start_sec * 1000)
    fc.append('[%d:a]adelay=%d|%d,volume=1.95[v%d]' % (k + 2, ms, ms, k))
    labels.append('[v%d]' % k)
fc.append((''.join(labels) + 'amix=inputs=%d:normalize=0[voall]' % len(labels)) if len(labels) > 1 else (labels[0] + 'anull[voall]'))
fc.append('[voall]asplit=2[vok][vom]')
fc.append('[1:a]volume=0.5[mus]')
fc.append('[mus][vok]sidechaincompress=threshold=0.03:ratio=10:attack=5:release=320[duck]')
fc.append('[duck][vom]amix=inputs=2:normalize=0:duration=first[mixed]')
fc.append('[mixed]afade=t=out:st=%.2f:d=0.7,loudnorm=I=-14:TP=-1.5:LRA=11[out]' % max(0, film_sec - 0.7))
# Convert the render's full-range (pc) yuvj420p to limited-range (tv) yuv420p so Windows players accept it.
fc.append('[0:v]scale=iw:ih:in_range=pc:out_range=tv,format=yuv420p[vid]')

# Standard, maximally-compatible mp4: yuv420p limited range + faststart (moov at front).
cmd = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(fc),
       '-map', '[vid]', '-map', '[out]',
       '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-profile:v', 'high', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart',
       '-c:a', 'aac', '-b:a', '256k', '-t', '%.3f' % film_sec, OUT]
subprocess.run(cmd, check=True)
print('Wrote ' + OUT)
