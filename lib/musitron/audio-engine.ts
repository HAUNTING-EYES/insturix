import type { DAWTrack, TrackEffect } from "./daw-types";

interface TrackNodeChain {
  input: GainNode;
  gain: GainNode;
  pan: StereoPannerNode;
  muteGain: GainNode;
  analyser: AnalyserNode;
}

interface EffectNodeSet {
  effectId: string;
  first: AudioNode;
  last: AudioNode;
  allNodes: AudioNode[];
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private trackNodes = new Map<string, TrackNodeChain>();
  private bufferCache = new Map<string, AudioBuffer>();
  private activeSources: AudioBufferSourceNode[] = [];
  private activeRegionGains: GainNode[] = [];
  private soloedTracks = new Set<string>();
  private mutedTracks = new Set<string>();
  private analyserBuffers = new Map<string, Uint8Array<ArrayBuffer>>();
  private masterAnalyserBuffer: Uint8Array<ArrayBuffer> | null = null;
  private trackEffectNodes = new Map<string, EffectNodeSet[]>();
  private reverbIRCache = new Map<number, AudioBuffer>();

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext({ sampleRate: 44100 });
    this.masterGain = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterAnalyser.smoothingTimeConstant = 0.8;
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  getTrackInput(trackId: string): GainNode | null {
    return this.trackNodes.get(trackId)?.input ?? null;
  }

  ensureTrack(trackId: string): void {
    if (!this.ctx || !this.masterGain || this.trackNodes.has(trackId)) return;

    const input = this.ctx.createGain();
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    const muteGain = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    input.connect(gain);
    gain.connect(pan);
    pan.connect(muteGain);
    muteGain.connect(analyser);
    analyser.connect(this.masterGain);

    this.trackNodes.set(trackId, { input, gain, pan, muteGain, analyser });
  }

  removeTrack(trackId: string): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;
    const fxSets = this.trackEffectNodes.get(trackId) ?? [];
    for (const ens of fxSets) {
      for (const node of ens.allNodes) {
        try { node.disconnect(); } catch {}
      }
    }
    this.trackEffectNodes.delete(trackId);
    try {
      nodes.input.disconnect();
      nodes.gain.disconnect();
      nodes.pan.disconnect();
      nodes.muteGain.disconnect();
      nodes.analyser.disconnect();
    } catch {}
    this.trackNodes.delete(trackId);
    this.analyserBuffers.delete(trackId);
    this.soloedTracks.delete(trackId);
    this.mutedTracks.delete(trackId);
    this.updateMuteState();
  }

  pruneRemovedTracks(activeIds: Set<string>): void {
    for (const id of this.trackNodes.keys()) {
      if (!activeIds.has(id)) {
        this.removeTrack(id);
      }
    }
  }

  setTrackGain(trackId: string, value: number): void {
    const nodes = this.trackNodes.get(trackId);
    if (nodes && this.ctx) {
      nodes.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    }
  }

  setTrackPan(trackId: string, value: number): void {
    const nodes = this.trackNodes.get(trackId);
    if (nodes && this.ctx) {
      nodes.pan.pan.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    }
  }

  setTrackMute(trackId: string, muted: boolean): void {
    if (muted) this.mutedTracks.add(trackId);
    else this.mutedTracks.delete(trackId);
    this.updateMuteState();
  }

  setTrackSolo(trackId: string, soloed: boolean): void {
    if (soloed) this.soloedTracks.add(trackId);
    else this.soloedTracks.delete(trackId);
    this.updateMuteState();
  }

  private updateMuteState(): void {
    if (!this.ctx) return;
    const hasSolo = this.soloedTracks.size > 0;
    for (const [id, nodes] of this.trackNodes) {
      let shouldMute = this.mutedTracks.has(id);
      if (hasSolo && !this.soloedTracks.has(id)) shouldMute = true;
      nodes.muteGain.gain.setTargetAtTime(shouldMute ? 0 : 1, this.ctx.currentTime, 0.01);
    }
  }

  setMasterGain(value: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    }
  }

  async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const cached = this.bufferCache.get(url);
    if (cached) return cached;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.bufferCache.set(url, audioBuffer);
      return audioBuffer;
    } catch (e) {
      console.error("[AudioEngine] Failed to load buffer:", url, e);
      return null;
    }
  }

  async schedulePlayback(tracks: DAWTrack[], position: number): Promise<void> {
    if (!this.ctx) await this.init();
    await this.resume();
    this.stopPlayback();

    const now = this.ctx!.currentTime;

    for (const track of tracks) {
      this.ensureTrack(track.id);
      const nodes = this.trackNodes.get(track.id);
      if (!nodes) continue;

      for (const region of track.regions) {
        if (region.muted) continue;
        const regionEnd = region.startTime + region.duration;
        if (regionEnd <= position) continue;

        const buffer = await this.loadBuffer(region.sourceUrl);
        if (!buffer) continue;

        const source = this.ctx!.createBufferSource();
        source.buffer = buffer;

        const regionGain = this.ctx!.createGain();
        regionGain.gain.value = region.gain;
        source.connect(regionGain);
        regionGain.connect(nodes.input);
        this.activeRegionGains.push(regionGain);

        const relativeStart = region.startTime - position;

        if (relativeStart >= 0) {
          source.start(now + relativeStart, region.sourceOffset, region.duration);
        } else {
          const offset = region.sourceOffset + Math.abs(relativeStart);
          const remaining = region.duration + relativeStart;
          if (remaining > 0) {
            source.start(now, offset, remaining);
          }
        }

        source.onended = () => {
          const idx = this.activeSources.indexOf(source);
          if (idx >= 0) this.activeSources.splice(idx, 1);
        };

        this.activeSources.push(source);
      }
    }
  }

  stopPlayback(): void {
    for (const source of this.activeSources) {
      try { source.stop(); } catch {}
    }
    this.activeSources = [];
    for (const gain of this.activeRegionGains) {
      try { gain.disconnect(); } catch {}
    }
    this.activeRegionGains = [];
  }

  getTrackAnalyserData(trackId: string): Uint8Array | null {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return null;
    let buf = this.analyserBuffers.get(trackId);
    if (!buf) {
      buf = new Uint8Array(nodes.analyser.frequencyBinCount);
      this.analyserBuffers.set(trackId, buf);
    }
    nodes.analyser.getByteTimeDomainData(buf);
    return buf;
  }

  getMasterAnalyserData(): Uint8Array | null {
    if (!this.masterAnalyser) return null;
    if (!this.masterAnalyserBuffer) {
      this.masterAnalyserBuffer = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    }
    this.masterAnalyser.getByteTimeDomainData(this.masterAnalyserBuffer);
    return this.masterAnalyserBuffer;
  }

  private generateReverbIR(decay: number): AudioBuffer {
    if (!this.ctx) throw new Error("No AudioContext");
    const key = Math.round(decay * 10);
    const cached = this.reverbIRCache.get(key);
    if (cached) return cached;

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * Math.min(decay, 10));
    const buffer = this.ctx.createBuffer(2, length, sampleRate);
    const tau = sampleRate * decay * 0.3;
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / tau);
      }
    }
    this.reverbIRCache.set(key, buffer);
    return buffer;
  }

  private createEffectNodes(effect: TrackEffect): EffectNodeSet | null {
    if (!this.ctx) return null;

    if (effect.type === "eq") {
      const low = this.ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 320;
      low.gain.value = effect.params.lowGain ?? 0;

      const mid = this.ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1000;
      mid.Q.value = 1;
      mid.gain.value = effect.params.midGain ?? 0;

      const high = this.ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 3200;
      high.gain.value = effect.params.highGain ?? 0;

      low.connect(mid);
      mid.connect(high);

      return { effectId: effect.id, first: low, last: high, allNodes: [low, mid, high] };
    }

    if (effect.type === "compressor") {
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = effect.params.threshold ?? -24;
      comp.ratio.value = effect.params.ratio ?? 4;
      comp.attack.value = effect.params.attack ?? 0.003;
      comp.release.value = effect.params.release ?? 0.25;
      comp.knee.value = effect.params.knee ?? 30;

      return { effectId: effect.id, first: comp, last: comp, allNodes: [comp] };
    }

    if (effect.type === "delay") {
      const mix = effect.params.mix ?? 0.3;
      const entry = this.ctx.createGain();
      const exit = this.ctx.createGain();
      const dryGain = this.ctx.createGain();
      dryGain.gain.value = 1;
      const wetGain = this.ctx.createGain();
      wetGain.gain.value = mix;
      const delay = this.ctx.createDelay(5);
      delay.delayTime.value = effect.params.time ?? 0.3;
      const feedback = this.ctx.createGain();
      feedback.gain.value = effect.params.feedback ?? 0.3;

      entry.connect(dryGain);
      dryGain.connect(exit);
      entry.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(exit);
      delay.connect(feedback);
      feedback.connect(delay);

      return { effectId: effect.id, first: entry, last: exit, allNodes: [entry, exit, dryGain, wetGain, delay, feedback] };
    }

    if (effect.type === "reverb") {
      const mix = effect.params.mix ?? 0.2;
      const entry = this.ctx.createGain();
      const exit = this.ctx.createGain();
      const dryGain = this.ctx.createGain();
      dryGain.gain.value = 1;
      const wetGain = this.ctx.createGain();
      wetGain.gain.value = mix;
      const convolver = this.ctx.createConvolver();
      convolver.buffer = this.generateReverbIR(effect.params.decay ?? 2);

      entry.connect(dryGain);
      dryGain.connect(exit);
      entry.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(exit);

      return { effectId: effect.id, first: entry, last: exit, allNodes: [entry, exit, dryGain, wetGain, convolver] };
    }

    return null;
  }

  updateTrackEffects(trackId: string, effects: TrackEffect[]): void {
    const chain = this.trackNodes.get(trackId);
    if (!chain || !this.ctx) return;

    const oldEffects = this.trackEffectNodes.get(trackId) ?? [];
    for (const ens of oldEffects) {
      for (const node of ens.allNodes) {
        try { node.disconnect(); } catch {}
      }
    }
    try { chain.input.disconnect(); } catch {}

    const activeEffects = effects
      .filter((fx) => !fx.bypassed)
      .sort((a, b) => a.order - b.order);

    const newSets: EffectNodeSet[] = [];
    for (const fx of activeEffects) {
      const set = this.createEffectNodes(fx);
      if (set) newSets.push(set);
    }
    this.trackEffectNodes.set(trackId, newSets);

    if (newSets.length === 0) {
      chain.input.connect(chain.gain);
    } else {
      chain.input.connect(newSets[0].first);
      for (let i = 0; i < newSets.length - 1; i++) {
        newSets[i].last.connect(newSets[i + 1].first);
      }
      newSets[newSets.length - 1].last.connect(chain.gain);
    }
  }

  destroy(): void {
    this.stopPlayback();
    for (const [, nodes] of this.trackNodes) {
      try { nodes.input.disconnect(); } catch {}
    }
    for (const fxSets of this.trackEffectNodes.values()) {
      for (const ens of fxSets) {
        for (const node of ens.allNodes) {
          try { node.disconnect(); } catch {}
        }
      }
    }
    this.trackEffectNodes.clear();
    this.reverbIRCache.clear();
    this.trackNodes.clear();
    this.analyserBuffers.clear();
    this.bufferCache.clear();
    this.soloedTracks.clear();
    this.mutedTracks.clear();
    this.activeRegionGains = [];
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.masterAnalyser = null;
    this.masterAnalyserBuffer = null;
  }
}
