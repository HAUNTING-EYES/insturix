// Beat grid. The film is authored at 120 BPM so cuts and hits fall on beats.
// When you drop a track at public/music.mp3: set HAS_MUSIC = true and change BPM to match the
// song's tempo — the whole timeline is expressed in beats/bars, so it re-locks to the new grid.
export const FPS = 60;
export const BPM = 136; // back to the original track (beat ≈ 26.47f @60fps)
export const BEAT = (FPS * 60) / BPM;
export const BAR = BEAT * 4; // 60 frames
export const beats = (n: number) => Math.round(n * BEAT);
export const bars = (n: number) => Math.round(n * BAR);

// Audio. Drop a file at public/music.mp3, flip HAS_MUSIC, set BPM above to the track's tempo.
export const HAS_MUSIC = true;
export const MUSIC_FILE = 'music.mp3';
export const MUSIC_VOLUME = 0.85;
