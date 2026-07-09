import React from 'react';
import {AbsoluteFill, Freeze} from 'remotion';
import {InsturixExplainer} from '../InsturixExplainer';

// Evaluation aid: tiles 25 frozen frames sampled evenly across the film into one 5×5 grid,
// so a single still render shows the whole pacing arc. Render: npx remotion still ContactSheet out/sheet.png
const COLS = 5;
const ROWS = 5;
const CELL_W = 1920 / COLS; // 384
const CELL_H = (CELL_W * 1080) / 1920; // 216 — exact 16:9

export const ContactSheet: React.FC<{total: number}> = ({total}) => {
  const n = COLS * ROWS;
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      {Array.from({length: n}, (_, i) => {
        const f = Math.round((i / (n - 1)) * (total - 1));
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: col * CELL_W,
              top: row * CELL_H,
              width: CELL_W,
              height: CELL_H,
              overflow: 'hidden',
              border: '1px solid #2a2a28',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 1920,
                height: 1080,
                transform: `scale(${CELL_W / 1920})`,
                transformOrigin: 'top left',
              }}
            >
              <Freeze frame={f}>
                <InsturixExplainer />
              </Freeze>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 5,
                bottom: 4,
                fontFamily: 'monospace',
                fontSize: 12,
                color: '#fff',
                background: '#000000cc',
                padding: '1px 5px',
                borderRadius: 3,
              }}
            >
              f{f}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
