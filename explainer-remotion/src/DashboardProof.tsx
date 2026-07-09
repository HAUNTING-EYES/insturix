import React from 'react';
import {AbsoluteFill, Audio, staticFile} from 'remotion';
import {DashboardScreen, DASH_SFX} from './screens/DashboardScreen';
import {SfxTrack} from './audio';

// Proof of the beat-matched build + SFX: the dashboard assembles on the 136 BPM grid, the music
// bed plays under it, and the procedural SFX punctuate each hit (ticks on card-drops, click+impact
// on the project click). Music slightly ducked so the SFX read.
export const DashboardProof: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#0B0B0A'}}>
    <DashboardScreen />
    <Audio src={staticFile('music.mp3')} volume={0.5} />
    <SfxTrack cues={DASH_SFX} />
  </AbsoluteFill>
);
