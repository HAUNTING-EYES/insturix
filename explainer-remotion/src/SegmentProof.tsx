import React from 'react';
import {OneTakeFilm, computeLayout, Station} from './OneTakeFilm';
import {DashboardScreen} from './screens/DashboardScreen';
import {EditronScreen} from './screens/EditronScreen';
import {AnalyzeScreen} from './screens/AnalyzeScreen';

// Proof of the one-take spine: dashboard → push-zoom INTO the "Pricing explainer v2" card (Edit
// column) → the Editron editor → push-zoom INTO the video monitor → the Alyzitron score. No cuts.
const STATIONS: Station[] = [
  {key: 'dash', node: <DashboardScreen />, hold: 90, focal: {x: 632, y: 262}},
  {key: 'edit', node: <EditronScreen />, hold: 130, focal: {x: 815, y: 380}},
  {key: 'analyze', node: <AnalyzeScreen />, hold: 150},
];

export const SEGMENT_DURATION = computeLayout(STATIONS).total;
export const SegmentProof: React.FC = () => <OneTakeFilm stations={STATIONS} />;
