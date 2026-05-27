import type { OverlayDefinition } from './utility-types';
import defs from './overlay-definitions.json';

export function getOverlayDefinitions(): OverlayDefinition[] {
  return defs as OverlayDefinition[];
}
