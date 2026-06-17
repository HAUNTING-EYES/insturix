import { describe, expect, it } from 'vitest';

import {
  evaluateRealProjectMgTasteGate,
} from '../../lib/editron/motion-graphics/engine/eval/real-project-mg-taste-gate';

describe('real project MG taste gate', () => {
  it('fails the Hank-like one-MG weak tiny stat project without special casing the project id', () => {
    const report = evaluateRealProjectMgTasteGate({
      projectId: 'any-long-project',
      fps: 30,
      durationInFrames: 16427,
      genreParameters: { graphic_density: 0.83 },
      overlays: [
        captionTrack(0, 16427),
        {
          id: 42,
          type: 'motion-graphic',
          from: 3688,
          durationInFrames: 72,
          content: {
            value: '0.02',
            label: 'humans spoken to per day',
            quantityKind: 'count',
            semanticAtoms: {
              quantity: { displayText: '0.02', kind: 'count', unit: 'people' },
            },
          },
          recipe: {
            id: 'composed-numeric',
            layout: { position: 'center', maxWidth: '64%', captionZoneAware: true },
            elements: [
              { role: 'counter' },
              { role: 'numeric-sparse-rate-trace' },
              { role: 'label' },
            ],
          },
          metadata: {
            sourceType: 'edl-graphic',
            graphicType: 'atomic-graphic',
            placementRegion: 'middle-right',
          },
        },
      ],
    });

    expect(report.status).toBe('fail');
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'mg-count-too-low', severity: 'fail' }),
      expect.objectContaining({ code: 'missing-semantic-candidate-selection', severity: 'fail' }),
      expect.objectContaining({ code: 'weak-tiny-stat-selected', severity: 'fail' }),
      expect.objectContaining({ code: 'caption-active-center-stage', severity: 'fail' }),
      expect.objectContaining({ code: 'placement-request-drifted-to-center', severity: 'warn' }),
    ]));
    expect(JSON.stringify(report)).not.toMatch(/proj_sH-nZy0DtNOq|Hank|preset|template-menu/i);
  });

  it('passes a varied audited project with licensed semantic selections and caption-safe placements', () => {
    const overlays = [
      captionTrack(0, 9000),
      licensedMg(1, 300, 'bounded-stat', ['bounded-proportion', 'source-span', 'salience'], 'top-right', 'top-right'),
      licensedMg(2, 1500, 'identity', ['named-entity', 'source-span'], 'top-left', 'top-left', 'composed-identity'),
      licensedMg(3, 2700, 'comparison', ['comparison-relation', 'source-span'], 'bottom-right', 'bottom-right', 'composed-comparison'),
      licensedMg(4, 3900, 'quote', ['quote-proof', 'source-span'], 'top-left', 'top-left', 'composed-quote'),
      licensedMg(5, 5100, 'list', ['ordered-list', 'source-span'], 'bottom-right', 'bottom-right', 'composed-process'),
    ];

    const report = evaluateRealProjectMgTasteGate({
      projectId: 'healthy-project',
      fps: 30,
      durationInFrames: 9000,
      genreParameters: { graphic_density: 2.3 },
      overlays,
    });

    expect(report.status).toBe('pass');
    expect(report.summary.motionGraphicCount).toBe(5);
    expect(report.findings.filter((finding) => finding.severity === 'fail')).toHaveLength(0);
  });
});

function captionTrack(from: number, durationInFrames: number) {
  return {
    id: 'caption',
    type: 'caption',
    from,
    durationInFrames,
    top: 860,
    height: 140,
    width: 1280,
  };
}

function licensedMg(
  id: number,
  from: number,
  factKind: string,
  licenses: string[],
  placementRegion: string,
  layoutPosition: string,
  recipeId = 'composed-numeric',
) {
  return {
    id,
    type: 'motion-graphic',
    from,
    durationInFrames: 90,
    content: { value: `${id * 10}%`, label: `fact ${id}`, quantityKind: 'percentage' },
    recipe: {
      id: recipeId,
      layout: { position: layoutPosition, maxWidth: '48%', captionZoneAware: true },
      elements: [{ role: factKind }],
    },
    metadata: {
      sourceType: 'edl-graphic',
      placementRegion,
      semanticMgCandidateSelection: {
        selectedCandidate: {
          id: `candidate-${id}`,
          factKind,
          licenses,
        },
      },
      mgExpressionAuthority: {
        semanticCandidate: { factKind, licenses },
      },
    },
  };
}
