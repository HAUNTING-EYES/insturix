import React from 'react';
import {ScreenEngine} from './ScreenEngine';
import {INSTURIX} from '../brand';
import type {ScreenSpec} from './spec';

// PROOF: the SAME content as the hand-built DashboardScreen.tsx, but expressed as a SPEC and rendered by the
// generic engine. If this matches the hand-built bar, the architecture is proven (any brand → live screen).
const SPEC: ScreenSpec = {
  shell: {title: 'Production Floor', subtitle: 'EVERY VIDEO. ONE PIPELINE.', primaryAction: 'New project'},
  body: {
    type: 'kanban',
    columns: [
      {label: 'Script', cards: [{title: 'Q4 product launch — teaser'}, {title: 'Founder origin story'}]},
      {label: 'Edit', cards: [{title: 'Pricing explainer v2', badge: {kind: 'score', label: 'QC', value: 72}}, {title: 'Customer story — Acme'}]},
      {label: 'Publish', cards: [{title: 'Onboarding walkthrough', badge: {kind: 'status', label: 'Ready'}}]},
    ],
  },
  demo: {cursor: [{col: 1, card: 0, click: true}], camera: 'push'},
};

export const ScreenTest: React.FC = () => <ScreenEngine spec={SPEC} brand={INSTURIX} />;
