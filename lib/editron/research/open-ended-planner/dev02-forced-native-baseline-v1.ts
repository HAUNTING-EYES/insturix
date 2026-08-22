import { OverlayType, type ClipOverlay, type ImageOverlay, type KeyframeTrack, type Overlay, type ShapeOverlay, type TextOverlay } from '@/components/editron/editor/version-7.0.0/types';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const DEV02_FORCED_NATIVE_BASELINE_VERSION_V1 = 'EDITRON_OE_DEV02_FORCED_NATIVE_BASELINE_V1' as const;
export const DEV02_FORCED_NATIVE_CANVAS_V1 = Object.freeze({ width: 1080, height: 1920, fps: 30, durationInFrames: 345 });
export const DEV02_FORCED_NATIVE_STILL_PATHS_V1 = Object.freeze({
  wide108: '/dev02-wide-0108.png', wide168: '/dev02-wide-0168.png',
  close318: '/dev02-close-0318.png', close180: '/dev02-close-0180.png',
});

type Geometry = Readonly<{ left: number; top: number; width: number; height: number }>;
const LEFT_TOP = { left: 5, top: 5, width: 350, height: 950 } as const;
const RIGHT_TOP = { left: 725, top: 5, width: 350, height: 950 } as const;
const LEFT_BOTTOM = { left: 5, top: 965, width: 350, height: 950 } as const;
const RIGHT_BOTTOM = { left: 725, top: 965, width: 350, height: 950 } as const;
const CENTRE = { left: 365, top: 645, width: 350, height: 630 } as const;

const topTravel = track('y', [[0, -1003], [108, 5]]);
const bottomTravel = track('y', [[0, -43], [108, 965]]);

/**
 * Forced research alternative only. These duplicated overlays express a
 * relational filmstrip through the current native value/keyframe schema; they
 * are not a second filmstrip resolver or a production routing decision.
 */
export function buildDev02ForcedNativeOverlaysV1(): readonly Overlay[] {
  const overlays: Overlay[] = [
    shape(2000, 0, 345, 9, { left: 0, top: 0, width: 1080, height: 1920 }, '#000000'),
    video(2001, '/dev02-wide.mp4', 'dev02-wide', 0, 180, 0, 8, LEFT_TOP, '25% 50%', [topTravel]),
    video(2002, '/dev02-wide.mp4', 'dev02-wide', 0, 120, 60, 8, RIGHT_TOP, '75% 50%', [topTravel]),
    video(2003, '/dev02-wide.mp4', 'dev02-wide', 120, 60, 0, 8, RIGHT_TOP, '75% 50%'),
    video(2004, '/dev02-close.mp4', 'dev02-close', 0, 135, 210, 8, LEFT_BOTTOM, '25% 50%', [bottomTravel]),
    video(2005, '/dev02-close.mp4', 'dev02-close', 135, 45, 180, 8, LEFT_BOTTOM, '25% 50%'),
    video(2006, '/dev02-close.mp4', 'dev02-close', 0, 135, 210, 8, RIGHT_BOTTOM, '75% 50%', [bottomTravel]),
    video(2007, '/dev02-close.mp4', 'dev02-close', 135, 45, 180, 8, RIGHT_BOTTOM, '75% 50%'),
    image(2008, DEV02_FORCED_NATIVE_STILL_PATHS_V1.close180, 'dev02-close-frame-180', 0, 145, 6, CENTRE, '50% 50%', [
      track('y', [[0, 1965], [108, 645]]), track('scale', [[0, 0.7], [24, 1]]),
    ]),
    image(2009, DEV02_FORCED_NATIVE_STILL_PATHS_V1.close180, 'dev02-close-frame-180', 145, 35, 5,
      { left: 0, top: 0, width: 1080, height: 1920 }, '50% 50%', [track('scale', [[0, 0.326389], [34, 1]])]),
    image(2010, DEV02_FORCED_NATIVE_STILL_PATHS_V1.wide108, 'dev02-wide-frame-108', 108, 37, 7, LEFT_TOP, '25% 50%'),
    image(2011, DEV02_FORCED_NATIVE_STILL_PATHS_V1.wide168, 'dev02-wide-frame-168', 108, 37, 7, RIGHT_TOP, '75% 50%'),
    image(2012, DEV02_FORCED_NATIVE_STILL_PATHS_V1.close318, 'dev02-close-frame-318', 108, 37, 7, LEFT_BOTTOM, '25% 50%'),
    image(2013, DEV02_FORCED_NATIVE_STILL_PATHS_V1.close318, 'dev02-close-frame-318', 108, 37, 7, RIGHT_BOTTOM, '75% 50%'),
    text(2014),
    video(2015, '/dev02-close.mp4', 'dev02-close', 180, 165, 180, 5,
      { left: 0, top: 0, width: 1080, height: 1920 }, '50% 50%'),
  ];
  return deepFreezeV1(overlays);
}

const nativeOverlays = buildDev02ForcedNativeOverlaysV1();
export const DEV02_FORCED_NATIVE_BASELINE_V1 = deepFreezeV1({
  schemaVersion: DEV02_FORCED_NATIVE_BASELINE_VERSION_V1,
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
  taskId: 'DEV-02', route: 'FORCED_NATIVE', projectId: 'oe-dev-02', expectedProjectRevision: 'R3',
  targetRange: { startFrame: 0, endExclusiveFrame: 345 },
  sourceBindings: [
    { assetId: 'dev02-wide', sourceRanges: [[0, 180]] },
    { assetId: 'dev02-close', sourceRanges: [[180, 345]] },
  ],
  rendererOwner: 'components/editron/editor/version-7.0.0/remotion/index.ts',
  overlayPlanHash: hashCanonicalJsonV1(nativeOverlays),
  editability: {
    overlayCount: nativeOverlays.length,
    keyframeTrackCount: nativeOverlays.reduce((count, overlay) => count + (overlay.keyframeTracks?.length ?? 0), 0),
    keyframeCount: nativeOverlays.reduce((count, overlay) => count + (overlay.keyframeTracks?.reduce((sum, item) => sum + item.keyframes.length, 0) ?? 0), 0),
    crossElementRelationshipCount: 0,
    limitation: 'Current native state stores independent values/keyframes; shared panel relationships and animated width/height are not represented.',
  },
  stateEffects: [],
});
export const DEV02_FORCED_NATIVE_BASELINE_HASH_V1 = hashCanonicalJsonV1(DEV02_FORCED_NATIVE_BASELINE_V1);

function track(property: KeyframeTrack['property'], points: readonly (readonly [number, number])[]): KeyframeTrack {
  return { property, keyframes: points.map(([frame, value]) => ({ frame, value, easing: 'linear' })) };
}
function base(id: number, from: number, durationInFrames: number, row: number, geometry: Geometry) {
  return { id, from, durationInFrames, row, ...geometry, isDragging: false, rotation: 0 };
}
function video(id: number, src: string, assetId: string, from: number, duration: number, videoStartTime: number, row: number, geometry: Geometry, objectPosition: string, keyframeTracks?: KeyframeTrack[]): ClipOverlay {
  return { ...base(id, from, duration, row, geometry), type: OverlayType.VIDEO, src, content: src, assetId, videoStartTime, hasNativeAudio: false, styles: { objectFit: 'cover', objectPosition, opacity: 1, volume: 0 }, ...(keyframeTracks ? { keyframeTracks } : {}) };
}
function image(id: number, src: string, assetId: string, from: number, duration: number, row: number, geometry: Geometry, objectPosition: string, keyframeTracks?: KeyframeTrack[]): ImageOverlay {
  return { ...base(id, from, duration, row, geometry), type: OverlayType.IMAGE, src, content: src, assetId, styles: { objectFit: 'cover', objectPosition, opacity: 1 }, ...(keyframeTracks ? { keyframeTracks } : {}) };
}
function shape(id: number, from: number, duration: number, row: number, geometry: Geometry, fill: string): ShapeOverlay {
  return { ...base(id, from, duration, row, geometry), type: OverlayType.SHAPE, content: 'rectangle', styles: { fill, opacity: 1 } };
}
function text(id: number): TextOverlay {
  return { ...base(id, 0, 172, 0, { left: 0, top: 0, width: 1080, height: 1920 }), type: OverlayType.TEXT, content: 'YOUR EVENT\nRECAP', styles: { fontSize: '112px', fontWeight: '700', color: '#F7E300', backgroundColor: 'transparent', fontFamily: 'Arial', fontStyle: 'normal', textDecoration: 'none', lineHeight: '0.9', letterSpacing: '-2px', textAlign: 'center', textShadow: '0 4px 0 rgba(0,0,0,0.8), 0 0 16px rgba(0,0,0,0.65)', opacity: 1 } };
}
