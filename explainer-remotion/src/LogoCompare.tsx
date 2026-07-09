import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {InsturixLogo} from './components/InsturixLogo';

// TEMP investigation: canonical logo.svg (ground truth) vs my inline InsturixLogo, to spot any divergence.
export const LogoCompare: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#1a1714'}}>
    <div style={{position: 'absolute', left: 180, top: 200, textAlign: 'center'}}>
      <div style={{color: '#aaa', fontFamily: 'monospace', fontSize: 22, marginBottom: 16}}>CANONICAL .svg</div>
      <Img src={staticFile('insturix-logo.svg')} style={{width: 420, height: 420}} />
    </div>
    <div style={{position: 'absolute', right: 180, top: 200, textAlign: 'center'}}>
      <div style={{color: '#aaa', fontFamily: 'monospace', fontSize: 22, marginBottom: 16}}>MINE (inline)</div>
      <InsturixLogo size={420} color="#ECE9E1" />
    </div>
  </AbsoluteFill>
);
