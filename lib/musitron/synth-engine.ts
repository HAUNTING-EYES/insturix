import type { SynthPatch, MIDINote } from "./daw-types";
import { midiNoteToFreq, DEFAULT_SYNTH_PATCH } from "./daw-types";

interface ActiveVoice {
  noteId: string;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  osc2Gain: GainNode;
  filter: BiquadFilterNode;
  envelope: GainNode;
  endTime: number;
}

export class SynthEngine {
  private ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private patch: SynthPatch = { ...DEFAULT_SYNTH_PATCH };
  private activeVoices = new Map<string, ActiveVoice>();
  private scheduledVoices: ActiveVoice[] = [];

  connect(ctx: AudioContext, destination: AudioNode): void {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.3;
    this.output.connect(destination);
  }

  disconnect(): void {
    this.stopAll();
    if (this.output) {
      try { this.output.disconnect(); } catch {}
      this.output = null;
    }
    this.ctx = null;
  }

  setPatch(patch: SynthPatch): void {
    this.patch = patch;
  }

  getPatch(): SynthPatch {
    return this.patch;
  }

  noteOn(noteId: string, pitch: number, velocity: number): void {
    if (!this.ctx || !this.output) return;
    this.noteOff(noteId);

    const now = this.ctx.currentTime;
    const freq = midiNoteToFreq(pitch);
    const vel = velocity / 127;
    const p = this.patch;

    const osc1 = this.ctx.createOscillator();
    osc1.type = p.osc1Wave;
    osc1.frequency.value = freq;
    osc1.detune.value = p.osc1Detune;

    const osc2 = this.ctx.createOscillator();
    osc2.type = p.osc2Wave;
    osc2.frequency.value = freq;
    osc2.detune.value = p.osc2Detune;

    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = p.osc2Mix;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = p.filterFreq;
    filter.Q.value = p.filterQ;

    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(vel, now + p.envAttack);
    envelope.gain.linearRampToValueAtTime(vel * p.envSustain, now + p.envAttack + p.envDecay);

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.output);

    osc1.start(now);
    osc2.start(now);

    this.activeVoices.set(noteId, { noteId, osc1, osc2, osc2Gain, filter, envelope, endTime: Infinity });
  }

  noteOff(noteId: string): void {
    const voice = this.activeVoices.get(noteId);
    if (!voice || !this.ctx) return;

    const now = this.ctx.currentTime;
    const p = this.patch;

    voice.envelope.gain.cancelScheduledValues(now);
    voice.envelope.gain.setValueAtTime(voice.envelope.gain.value, now);
    voice.envelope.gain.linearRampToValueAtTime(0, now + p.envRelease);

    const stopTime = now + p.envRelease + 0.05;
    voice.osc1.stop(stopTime);
    voice.osc2.stop(stopTime);
    voice.endTime = stopTime;

    this.activeVoices.delete(noteId);

    setTimeout(() => {
      try { voice.osc1.disconnect(); } catch {}
      try { voice.osc2.disconnect(); } catch {}
      try { voice.osc2Gain.disconnect(); } catch {}
      try { voice.filter.disconnect(); } catch {}
      try { voice.envelope.disconnect(); } catch {}
    }, (p.envRelease + 0.1) * 1000);
  }

  scheduleMIDI(notes: MIDINote[], bpm: number, regionStartTime: number, playbackPosition: number): void {
    if (!this.ctx || !this.output) return;

    this.stopScheduled();

    const now = this.ctx.currentTime;
    const beatSec = 60 / bpm;
    const p = this.patch;

    for (const note of notes) {
      const noteAbsStart = regionStartTime + note.startBeat * beatSec;
      const noteDuration = note.durationBeats * beatSec;
      const noteAbsEnd = noteAbsStart + noteDuration;

      if (noteAbsEnd <= playbackPosition) continue;

      const freq = midiNoteToFreq(note.pitch);
      const vel = note.velocity / 127;

      const relStart = noteAbsStart - playbackPosition;
      const audioStart = now + Math.max(0, relStart);

      const osc1 = this.ctx.createOscillator();
      osc1.type = p.osc1Wave;
      osc1.frequency.value = freq;
      osc1.detune.value = p.osc1Detune;

      const osc2 = this.ctx.createOscillator();
      osc2.type = p.osc2Wave;
      osc2.frequency.value = freq;
      osc2.detune.value = p.osc2Detune;

      const osc2Gain = this.ctx.createGain();
      osc2Gain.gain.value = p.osc2Mix;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = p.filterFreq;
      filter.Q.value = p.filterQ;

      const envelope = this.ctx.createGain();
      envelope.gain.setValueAtTime(0, audioStart);
      envelope.gain.linearRampToValueAtTime(vel, audioStart + p.envAttack);
      envelope.gain.linearRampToValueAtTime(vel * p.envSustain, audioStart + p.envAttack + p.envDecay);

      const releaseStart = audioStart + noteDuration;
      envelope.gain.setValueAtTime(vel * p.envSustain, releaseStart);
      envelope.gain.linearRampToValueAtTime(0, releaseStart + p.envRelease);

      osc1.connect(filter);
      osc2.connect(osc2Gain);
      osc2Gain.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.output);

      osc1.start(audioStart);
      osc2.start(audioStart);

      const stopTime = releaseStart + p.envRelease + 0.05;
      osc1.stop(stopTime);
      osc2.stop(stopTime);

      const voice: ActiveVoice = { noteId: note.id, osc1, osc2, osc2Gain, filter, envelope, endTime: stopTime };
      this.scheduledVoices.push(voice);

      const cleanupDelay = (stopTime - now + 0.1) * 1000;
      setTimeout(() => {
        try { osc1.disconnect(); } catch {}
        try { osc2.disconnect(); } catch {}
        try { osc2Gain.disconnect(); } catch {}
        try { filter.disconnect(); } catch {}
        try { envelope.disconnect(); } catch {}
        const idx = this.scheduledVoices.indexOf(voice);
        if (idx >= 0) this.scheduledVoices.splice(idx, 1);
      }, cleanupDelay);
    }
  }

  stopScheduled(): void {
    for (const voice of this.scheduledVoices) {
      try { voice.osc1.stop(); } catch {}
      try { voice.osc2.stop(); } catch {}
      try { voice.osc1.disconnect(); } catch {}
      try { voice.osc2.disconnect(); } catch {}
      try { voice.osc2Gain.disconnect(); } catch {}
      try { voice.filter.disconnect(); } catch {}
      try { voice.envelope.disconnect(); } catch {}
    }
    this.scheduledVoices = [];
  }

  stopAll(): void {
    for (const [, voice] of this.activeVoices) {
      try { voice.osc1.stop(); } catch {}
      try { voice.osc2.stop(); } catch {}
      try { voice.osc1.disconnect(); } catch {}
      try { voice.osc2.disconnect(); } catch {}
      try { voice.osc2Gain.disconnect(); } catch {}
      try { voice.filter.disconnect(); } catch {}
      try { voice.envelope.disconnect(); } catch {}
    }
    this.activeVoices.clear();

    for (const voice of this.scheduledVoices) {
      try { voice.osc1.stop(); } catch {}
      try { voice.osc2.stop(); } catch {}
      try { voice.osc1.disconnect(); } catch {}
      try { voice.osc2.disconnect(); } catch {}
      try { voice.osc2Gain.disconnect(); } catch {}
      try { voice.filter.disconnect(); } catch {}
      try { voice.envelope.disconnect(); } catch {}
    }
    this.scheduledVoices = [];
  }
}
