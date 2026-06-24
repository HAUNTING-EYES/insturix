import { describe, expect, it } from 'vitest';
import {
  createEditronUserOverrideLearningEvent,
  signalPathForEditronOverride,
} from '@/lib/editron/services/editron-brand-learning-events';

describe('Editron brand learning events', () => {
  it('maps transition overrides to motion learning events', () => {
    const event = createEditronUserOverrideLearningEvent({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      observedAt: '2026-06-22T12:00:00.000Z',
      kind: 'transition_style',
      beforeValue: 'fade',
      afterValue: 'hard-cut',
      overlayId: 'transition_1',
    });

    expect(event).toMatchObject({
      service: 'editron',
      signalPath: 'motion.transitionSharpness',
      editType: 'generated_output_correction',
      scope: 'project',
      polarity: 'replace',
      context: {
        userId: 'user_1',
        brandId: 'brand_1',
        projectId: 'project_1',
        sourceId: 'transition_1',
      },
      beforeValue: 'fade',
      afterValue: 'hard-cut',
      learningWeight: {
        category: 'invented',
        service: 'editron',
        signalClass: 'motion_dial',
      },
    });
  });

  it('maps frame-level filter overrides to visual learning events', () => {
    const event = createEditronUserOverrideLearningEvent({
      userId: 'user_1',
      projectId: 'project_1',
      observedAt: '2026-06-22T12:01:00.000Z',
      kind: 'filter_preset',
      beforeValue: 'warm',
      afterValue: 'cool',
      frame: 42,
    });

    expect(event.signalPath).toBe('visual.contrastPreference');
    expect(event.scope).toBe('frame');
    expect(event.context.frame).toBe(42);
    expect(event.learningWeight.signalClass).toBe('visual_dial');
  });

  it('keeps override signal paths explicit', () => {
    expect(signalPathForEditronOverride('transition_style')).toBe('motion.transitionSharpness');
    expect(signalPathForEditronOverride('filter_preset')).toBe('visual.contrastPreference');
  });
});
