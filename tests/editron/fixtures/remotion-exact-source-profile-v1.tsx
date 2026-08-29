import React from 'react';
import {
  AbsoluteFill,
  Composition,
  OffthreadVideo,
  registerRoot,
  staticFile,
} from 'remotion';

const ExactSourceProfileSceneV1: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: '#000' }}>
    <OffthreadVideo src={staticFile('exact-source.mkv')} />
  </AbsoluteFill>
);

const ExactSourceProfileRootV1: React.FC = () => (
  <Composition
    id="ExactSourceProfileV1"
    component={ExactSourceProfileSceneV1}
    durationInFrames={4}
    fps={30}
    width={64}
    height={64}
  />
);

registerRoot(ExactSourceProfileRootV1);
