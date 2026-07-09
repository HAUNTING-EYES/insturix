import React from 'react';
import {OneTakeFilm, computeLayout, Station, Z} from './OneTakeFilm';
import {HookScene} from './components/HookScene';
import {BrandMoment} from './components/BrandMoment';
import {ValueCounter} from './components/ValueCounter';
import {BrandVaultScan, BRANDVAULT_SFX} from './screens/BrandVaultScan';
import {BrandVaultBrain, BRANDBRAIN_SFX} from './screens/BrandVaultBrain';
import {ScriptScene, SCRIPT_SFX} from './screens/ScriptScene';
import {DashboardScreen, DASH_SFX, DASH_TARGET} from './screens/DashboardScreen';
import {EditronScreen, EDITRON_SFX} from './screens/EditronScreen';
import {AnalyzeScreen, ANALYZE_SFX} from './screens/AnalyzeScreen';
import {MoatScene, MOAT_SFX} from './screens/MoatScene';
import {FeatureInvite} from './components/FeatureInvite';
import {DistributeFormats, DISTRIBUTE_SFX} from './screens/DistributeFormats';
import {CalendarScene, CALENDAR_SFX} from './screens/CalendarScene';
import {ReviewsScene} from './components/ReviewsScene';
import {MetaReveal, META_SFX} from './screens/MetaReveal';
import {CTA} from './components/CTA';
import {SfxCue} from './audio';

// V9 "Lovable-grade" one-take film — our warm-dark+gold palette, Lovable's energy/structure:
// hook → Meet Insturix → live counter → the product (dashboard → editor builds → analyze) →
// multiplayer feature → publish burst → reviews → CTA. Holds are EXTENDED on the comprehension beats
// (Vault, script, Editron result, Analyze, calendar, reviews, meta) so there's time to READ — the
// motion/cursor/camera speed inside each scene is unchanged; only the static dwell after it grows.
const H = {hook: 238, brand: 160, brandvault: 208, brandbrain: 196, script: 239, value: 86, dash: 139, edit: 236, moat: 310, analyze: 192, distribute: 278, calendar: 226, feature: 113, reviews: 219, meta: 176, cta: 179};
const win = (h: number) => h + 2 * Z;

const FEATURE_SFX: SfxCue[] = [
  {name: 'click', at: 66, volume: 0.7},
  {name: 'pop', at: 72, volume: 0.5},
];
const REVIEW_SFX: SfxCue[] = [
  {name: 'pop', at: 12, volume: 0.4},
  {name: 'pop', at: 20, volume: 0.4},
  {name: 'pop', at: 28, volume: 0.4},
];
const CTA_SFX: SfxCue[] = [{name: 'success', at: 30, volume: 0.5}];

// `exit` = how each scene hands off to the next: text scenes slide (no zoom = no clipping); product
// seams zoom into a focal element. A varied, subtle accent rides each moving seam (added by OneTakeFilm).
const STATIONS: Station[] = [
  {key: 'hook', node: <HookScene durationInFrames={win(H.hook)} />, hold: H.hook, exit: 'fade'}, // fade (not slide) so "Not anymore." never clips off the top
  {key: 'brand', node: <BrandMoment durationInFrames={win(H.brand)} />, hold: H.brand, exit: 'cut'}, // clean settle (camera scene next)
  {key: 'brandvault', node: <BrandVaultScan />, hold: H.brandvault, exit: 'up', sfx: BRANDVAULT_SFX},
  {key: 'brandbrain', node: <BrandVaultBrain />, hold: H.brandbrain, exit: 'fade', sfx: BRANDBRAIN_SFX},
  {key: 'script', node: <ScriptScene />, hold: H.script, exit: 'left', sfx: SCRIPT_SFX},
  {key: 'value', node: <ValueCounter durationInFrames={win(H.value)} />, hold: H.value, exit: 'zoom', focal: {x: 960, y: 240}},
  {key: 'dash', node: <DashboardScreen />, hold: H.dash, exit: 'zoom', focal: DASH_TARGET, sfx: DASH_SFX},
  {key: 'edit', node: <EditronScreen />, hold: H.edit, exit: 'fade', focal: {x: 815, y: 380}, sfx: EDITRON_SFX},
  {key: 'moat', node: <MoatScene />, hold: H.moat, exit: 'up', sfx: MOAT_SFX},
  {key: 'analyze', node: <AnalyzeScreen />, hold: H.analyze, exit: 'cut', sfx: ANALYZE_SFX}, // match-cut: preview card carries into distribute
  {key: 'distribute', node: <DistributeFormats />, hold: H.distribute, exit: 'up', sfx: DISTRIBUTE_SFX}, // ONE card: burst → recede → every format
  {key: 'calendar', node: <CalendarScene />, hold: H.calendar, exit: 'up', sfx: CALENDAR_SFX},
  {key: 'feature', node: <FeatureInvite durationInFrames={win(H.feature)} />, hold: H.feature, exit: 'fade', sfx: FEATURE_SFX},
  {key: 'reviews', node: <ReviewsScene durationInFrames={win(H.reviews)} />, hold: H.reviews, exit: 'fade', sfx: REVIEW_SFX},
  {key: 'meta', node: <MetaReveal />, hold: H.meta, exit: 'fade', sfx: META_SFX},
  {key: 'cta', node: <CTA durationInFrames={win(H.cta)} />, hold: H.cta, sfx: CTA_SFX},
];

export const FILM_DURATION = computeLayout(STATIONS).total;
export const InsturixFilm: React.FC = () => <OneTakeFilm stations={STATIONS} music="music.mp3" musicVolume={0.42} />;
