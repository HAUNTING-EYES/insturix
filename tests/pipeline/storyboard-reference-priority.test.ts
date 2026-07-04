import { describe, expect, it } from 'vitest';
import {
  hasStrictLogoReferenceForScene,
  prioritizeStoryboardReferencesForScene,
} from '@/lib/pipeline/storyboard-reference-priority';

describe('storyboard reference priority', () => {
  it('uses the uploaded logo before character refs when a scene asks for a logo', () => {
    const scene = {
      title: 'Claim Your Future',
      sceneType: 'continuous',
      visualDescription: 'A confident team stands beside a large screen with a subtle glowing Insturix logo.',
    };
    const references = [
      {
        subjectId: 'team',
        name: 'Diverse Creative Team',
        category: 'character',
        imageUrl: 'https://cdn.example/team.png',
        scenesAppearingIn: [5],
      },
      {
        subjectId: 'logo',
        name: 'Insturix Logo',
        category: 'object',
        imageUrl: 'https://cdn.example/logo.png',
        source: 'user-upload',
        referenceProvenance: 'uploaded',
        requiresBrandEvidence: true,
        brandEvidenceStatus: 'resolved',
        scenesAppearingIn: [5],
      },
    ];

    const prioritized = prioritizeStoryboardReferencesForScene(scene, references);

    expect(prioritized.map((ref) => ref.subjectId)).toEqual(['logo', 'team']);
    expect(hasStrictLogoReferenceForScene(scene, references)).toBe(true);
  });

  it('keeps original order when the scene has no logo intent', () => {
    const scene = {
      title: 'Team Collaboration',
      sceneType: 'continuous',
      visualDescription: 'A team collaborates around a digital display.',
    };
    const references = [
      { subjectId: 'team', name: 'Diverse Creative Team', category: 'character', imageUrl: 'https://cdn.example/team.png' },
      {
        subjectId: 'logo',
        name: 'Insturix Logo',
        category: 'object',
        imageUrl: 'https://cdn.example/logo.png',
        source: 'user-upload',
        referenceProvenance: 'uploaded',
      },
    ];

    const prioritized = prioritizeStoryboardReferencesForScene(scene, references);

    expect(prioritized.map((ref) => ref.subjectId)).toEqual(['team', 'logo']);
    expect(hasStrictLogoReferenceForScene(scene, references)).toBe(false);
  });
});