import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TechnicalCapturePlanResult } from '@/components/dashboard/ThinkForge/production/TechnicalCapturePlanResult';
import type { ProductionCapabilityProfile } from '@/lib/thinkforge/production/production-capability-profile';
import type { PhysicalCaptureDesign } from '@/lib/thinkforge/schemas/physical-capture-design';
import type { TechnicalCapturePlan } from '@/lib/thinkforge/schemas/technical-capture-plan';

const profile = {
  spaces: [{
    id: 'space_studio',
    label: 'Quiet studio corner',
    naturalLightSources: [],
  }],
  equipment: [{ id: 'camera_phone', label: 'Approved phone camera' }],
} as unknown as ProductionCapabilityProfile;

const design = {
  globalCaptureStrategy: 'Preserve clear product evidence without inventing a presenter.',
  coverageIntents: [{
    id: 'coverage_1',
    narrativeObjective: 'Show the approved physical change clearly.',
  }],
} as unknown as PhysicalCaptureDesign;

const plan = {
  planHash: 'a'.repeat(64),
  overallApproach: 'Use the confirmed phone and quiet studio corner, then calibrate in preview.',
  unresolvedQuestions: [],
  setups: [{
    id: 'setup_1',
    coverageIntentIds: ['coverage_1'],
    cameraId: 'camera_phone',
    spaceId: 'space_studio',
    supportIds: [],
    lightIds: [],
    naturalLightSourceIds: [],
    modifierIds: [],
    accessoryIds: [],
    orientation: 'landscape',
    cameraOperation: 'operator-held',
    framingInstruction: 'Adjust the live preview until the full approved product state is readable.',
    viewpointInstruction: 'Keep the decisive product surface visible.',
    cameraBehaviorInstruction: 'Hold the view stable while the state changes.',
    focusInstruction: 'Confirm the decisive product detail stays sharp in preview.',
    lightingInstruction: 'Confirm the product surface is readable without glare.',
    soundInstruction: 'Record and play back a short test before the full take.',
    safetyInstructions: ['Keep the operator path clear.'],
    calibrationChecks: [{
      id: 'setup_1_check_sound',
      category: 'sound',
      instruction: 'Record and play back a short sound test.',
      passCondition: 'The required sound is clear without distracting noise.',
    }],
  }],
} as unknown as TechnicalCapturePlan;

describe('TechnicalCapturePlanResult', () => {
  it('shows real resource labels and beginner-observable calibration without fake geometry', () => {
    const html = renderToStaticMarkup(React.createElement(TechnicalCapturePlanResult, {
      design,
      plan,
      profile,
      onEditInputs: vi.fn(),
      onApprove: vi.fn(),
    }));

    expect(html).toContain('Approved phone camera');
    expect(html).toContain('Quiet studio corner');
    expect(html).toContain('Test recording + playback');
    expect(html).toContain('Approve calibrated setup');
    expect(html.toLowerCase()).not.toContain('normalized');
    expect(html.toLowerCase()).not.toContain('coordinate');
    expect(html).toContain('disabled');
  });

  it('surfaces unresolved questions and keeps approval disabled', () => {
    const html = renderToStaticMarkup(React.createElement(TechnicalCapturePlanResult, {
      design,
      plan: { ...plan, unresolvedQuestions: ['Confirm whether the selected space can be kept quiet.'] },
      profile,
      onEditInputs: vi.fn(),
      onApprove: vi.fn(),
    }));

    expect(html).toContain('Resolve before approval');
    expect(html).toContain('Confirm whether the selected space can be kept quiet.');
    expect(html).toContain('disabled');
  });
});
