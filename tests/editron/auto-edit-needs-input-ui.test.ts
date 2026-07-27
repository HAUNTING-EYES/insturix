import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AutoEditProcessing,
  missingFootageBeatsFromScriptCoverage,
} from '../../components/editron/project/auto-edit/auto-edit-processing';

describe('auto-edit missing-footage recovery UI', () => {
  it('derives only uncovered beats from the persisted grounding audit', () => {
    const beats = missingFootageBeatsFromScriptCoverage({
      beats: [
        { id: 'beat_1', scriptText: 'Show the proof', visualIntent: 'Hands demonstrate the proof' },
        { id: 'beat_2', scriptText: 'Show the result', visualIntent: 'Finished result in use' },
      ],
      assignments: [
        { beatId: 'beat_1', coverage: 'covered' },
        {
          beatId: 'beat_2',
          coverage: 'missing',
          verification: { notes: ['No uploaded shot shows the finished result.'] },
        },
      ],
    });

    expect(beats).toEqual([{
      id: 'beat_2',
      scriptText: 'Show the result',
      visualIntent: 'Finished result in use',
      coverage: 'missing',
      notes: ['No uploaded shot shows the finished result.'],
    }]);
    expect(missingFootageBeatsFromScriptCoverage(null)).toEqual([]);
  });

  it('renders actionable upload, filming, and generation paths without claiming completion', () => {
    vi.stubGlobal('React', React);
    const html = renderToStaticMarkup(React.createElement(AutoEditProcessing, {
      filename: 'Fashion process edit',
      stageIndex: 1,
      percent: 22,
      done: false,
      logLines: [],
      needsInput: {
        beats: [{
          id: 'beat_2',
          scriptText: 'Show the result',
          visualIntent: 'Finished result in use',
          coverage: 'missing',
          notes: ['No uploaded shot shows the finished result.'],
        }],
      },
    }));

    expect(html).toContain('The script asks for shots we cannot verify.');
    expect(html).toContain('Show the result');
    expect(html).toContain('Finished result in use');
    expect(html).toContain('Upload footage');
    expect(html).toContain('Copy film brief');
    expect(html).toContain('Copy generation prompt');
    expect(html).not.toContain('DONE');
  });
});
