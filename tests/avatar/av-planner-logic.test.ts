import { describe, expect, it } from 'vitest';
import {
  MODALITY_OPTIONS,
  buildPlanInput,
  type PlannerState,
} from '../../components/dashboard/avatar-vault/v2/av-planner-logic';

const baseState: PlannerState = {
  useCase: 'speech_delivery',
  renderModality: 'talking_head',
  prompt: 'ignored — buildPlanInput takes the prompt arg',
  script: 'Hello there.',
  negativePrompt: '',
  audioMode: 'tts_voiceover',
  audioSourceUrl: '',
  voiceReferenceUrl: '',
  audioRightsConfirmed: false,
  productImageUrls: '',
  providerId: 'd_id',
  aspectRatio: '9:16',
  durationSeconds: '8',
  resolution: '720p',
};

describe('planner renderModality wiring', () => {
  it('carries the chosen modality into the render request contract', () => {
    expect(buildPlanInput('rec1', { ...baseState, renderModality: 'body_motion' }, 'p').renderModality).toBe('body_motion');
    expect(buildPlanInput('rec1', { ...baseState, renderModality: 'talking_head' }, 'p').renderModality).toBe('talking_head');
  });

  it('offers talking head then full body as the two motion options', () => {
    expect(MODALITY_OPTIONS.map(([id]) => id)).toEqual(['talking_head', 'body_motion']);
  });
});
