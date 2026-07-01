import { describe, expect, it } from 'vitest';

import {
  buildFreeformElementMap,
  instrumentFreeformTsx,
} from '../../lib/editron/freeform-trace/instrument';
import {
  extractTracedElementCode,
  patchTracedElementCode,
} from '../../lib/editron/freeform-trace/patch';

const sampleScene = `import React from "react";
import { AbsoluteFill, Sequence } from "remotion";

export const Scene01 = () => {
  const titleOpacity = 1;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0A" }}>
      <div style={{ position: "absolute", top: 200 }}>
        <h1 style={{ fontSize: 72, color: "#FF4F00", fontWeight: 900, opacity: titleOpacity }}>
          SHIP FASTER
        </h1>
      </div>
      <Sequence from={15} durationInFrames={75}>
        <div className="feature-card">
          <span>Instant Render</span>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
`;

describe('freeform trace core', () => {
  it('instruments selectable JSX elements with trace attributes and an element map', () => {
    const result = instrumentFreeformTsx(sampleScene, { filename: 'Scene01.tsx' });

    expect(result.insertedAttributeCount).toBeGreaterThan(0);
    expect(result.code).toContain('data-eid="Scene01_001_8_4"');
    expect(result.code).toContain('data-source-loc="Scene01.tsx:10:8"');

    const title = result.elements.find((element) => element.tagName === 'h1');
    const wrapper = result.elements.find((element) => element.tagName === 'div');

    expect(title).toMatchObject({
      sourceLoc: 'Scene01.tsx:10:8',
      tagName: 'h1',
      editable: expect.arrayContaining(['text', 'style', 'children']),
      textPreview: 'SHIP FASTER',
    });
    expect(wrapper?.childEids).toContain(title?.eid);
    expect(title?.parentEid).toBe(wrapper?.eid);
  });

  it('preserves existing trace attributes instead of duplicating them', () => {
    const traced = `<div data-eid="hero_title" data-source-loc="Hero.tsx:1:0">Hello</div>`;
    const result = instrumentFreeformTsx(traced, { filename: 'Hero.tsx' });

    expect(result.insertedAttributeCount).toBe(0);
    expect(result.elements[0]).toMatchObject({
      eid: 'hero_title',
      sourceLoc: 'Hero.tsx:1:0',
      existingTrace: true,
    });
    expect(result.code.match(/data-eid=/g)).toHaveLength(1);
    expect(result.code.match(/data-source-loc=/g)).toHaveLength(1);
  });

  it('extracts and patches a traced element by source location while keeping the marker stable', () => {
    const traced = instrumentFreeformTsx(sampleScene, { filename: 'Scene01.tsx' });
    const title = traced.elements.find((element) => element.tagName === 'h1');
    expect(title).toBeDefined();

    const extracted = extractTracedElementCode(
      sampleScene,
      { sourceLoc: title!.sourceLoc },
      { filename: 'Scene01.tsx' },
    );

    expect(extracted).toContain('SHIP FASTER');
    expect(extracted).toContain('fontSize: 72');

    const patched = patchTracedElementCode(
      sampleScene,
      { sourceLoc: title!.sourceLoc },
      `<h1 style={{ fontSize: 48, color: "#E5E7EB", fontWeight: 400 }}>
  Ship faster
</h1>`,
      { filename: 'Scene01.tsx' },
    );

    expect(patched).toContain(`data-source-loc="${title!.sourceLoc}"`);
    expect(patched).toContain(`data-eid="${title!.eid}"`);
    expect(patched).toContain('Ship faster');
    expect(patched).toContain('fontWeight: 400');
    expect(patched).not.toContain('SHIP FASTER');

    const reinstrumented = instrumentFreeformTsx(patched, { filename: 'Scene01.tsx' });
    expect(reinstrumented.code.match(new RegExp(`data-eid="${title!.eid}"`, 'g'))).toHaveLength(1);
  });

  it('maps JSX returned from expressions without making it a separate architecture owner', () => {
    const source = `export const Scene = ({ items }: { items: string[] }) => (
  <div>
    {items.map((item) => <span key={item}>{item}</span>)}
  </div>
);`;

    const elements = buildFreeformElementMap(source, { filename: 'MappedScene.tsx' });
    const root = elements.find((element) => element.tagName === 'div');
    const mappedSpan = elements.find((element) => element.tagName === 'span');

    expect(mappedSpan).toMatchObject({
      sourceLoc: 'MappedScene.tsx:3:25',
      parentEid: root?.eid,
      editable: expect.arrayContaining(['text', 'style']),
    });
  });
});

