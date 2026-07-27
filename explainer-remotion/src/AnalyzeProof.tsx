import React from 'react';
import {AbsoluteFill, Audio, staticFile} from 'remotion';
import {AnalyzeScreen, ANALYZE_SFX} from './screens/AnalyzeScreen';
import {SfxTrack} from './audio';

// Proof of the analyze choreography + sound: score counts up, lands green on the beat with a success
// chime (riser building into it, impact + success on the land), strengths tick in. Music ducked.
export const AnalyzeProof: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#0B0B0A'}}>
    <AnalyzeScreen />
    <Audio src={staticFile('music.mp3')} volume={0.5} />
    <SfxTrack cues={ANALYZE_SFX} />
  </AbsoluteFill>
);
