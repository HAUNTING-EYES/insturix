import { describe, expect, it } from 'vitest';

import {
  parseProductionCapabilityProfile,
  PRODUCTION_CAPABILITY_PROFILE_VERSION,
} from '@/lib/thinkforge/production/production-capability-profile';

function profile() {
  return {
    version: PRODUCTION_CAPABILITY_PROFILE_VERSION,
    spaces: [{
      id: 'room_home',
      label: 'Home office',
      dimensionsM: { width: 3, depth: 4, height: 2.7 },
      naturalLightSources: [{ id: 'window_left', kind: 'window', direction: 'north' },
      ],
    }],
    equipment: [
      { id: 'phone_1', label: 'Existing phone', quantity: 1, availability: 'owned', category: 'camera', kind: 'phone' },
      { id: 'tripod_1', label: 'Phone tripod', quantity: 1, availability: 'owned', category: 'support', kind: 'tripod' },
      { id: 'mic_1', label: 'Wired lav', quantity: 1, availability: 'owned', category: 'audio', kind: 'wired-lav' },
    ],
    constraints: {
      currency: 'inr',
      maxIncrementalSpend: 0,
      rentalAllowed: false,
      purchaseAllowed: false,
      maxSetupMinutes: 20,
      maxSetupChanges: 1,
    },
  };
}

describe('ProductionCapabilityProfile contract', () => {
  it('does not invent a performer, self-shoot permission, or household substitutes when they are omitted', () => {
    const parsed = parseProductionCapabilityProfile(profile());

    expect(parsed.version).toBe(PRODUCTION_CAPABILITY_PROFILE_VERSION);
    expect(parsed.constraints.currency).toBe('INR');
    expect(parsed.preferences.defaultPlanTier).toBe('no-spend');
    expect(parsed.people).toEqual({
      performersAvailable: 0,
      cameraOperatorsAvailable: 0,
      assistantsAvailable: 0,
      selfShoot: false,
    });
    expect(parsed.preferences.householdSubstitutionsAllowed).toBe(false);
    expect(parsed.spaces[0]?.preferred).toBe(false);
    expect(parsed.equipment.map((item) => item.id)).toEqual(['phone_1', 'tripod_1', 'mic_1']);
  });

  it('allows only one explicitly preferred production space', () => {
    const base = profile();
    const input = {
      ...base,
      spaces: [
        { ...base.spaces[0], preferred: true },
        { ...base.spaces[0], id: 'room_studio', label: 'Studio', preferred: true },
      ],
    };

    expect(() => parseProductionCapabilityProfile(input)).toThrow(/only one production space may be preferred/);
  });

  it('accepts explicit stance measurements and rejects an empty subject calibration', () => {
    const measured = parseProductionCapabilityProfile({
      ...profile(),
      people: {
        performersAvailable: 1,
        cameraOperatorsAvailable: 0,
        assistantsAvailable: 0,
        selfShoot: true,
        subjectCalibration: {
          source: 'user-measured',
          eyeHeightMByStance: { seated: 1.23 },
        },
      },
    });
    expect(measured.people.subjectCalibration).toEqual({
      source: 'user-measured',
      eyeHeightMByStance: { seated: 1.23 },
    });

    expect(() => parseProductionCapabilityProfile({
      ...profile(),
      people: {
        performersAvailable: 1,
        cameraOperatorsAvailable: 0,
        assistantsAvailable: 0,
        selfShoot: true,
        subjectCalibration: { source: 'user-measured', eyeHeightMByStance: {} },
      },
    })).toThrow(/at least one measured eye height/);
  });

  it('rejects duplicate equipment ids because later plans reference them by id', () => {
    const input = profile();
    input.equipment.push({ ...input.equipment[0], label: 'Duplicate phone' });

    expect(() => parseProductionCapabilityProfile(input)).toThrow(/duplicate id: phone_1/);
  });

  it('rejects rental or purchase approval without a spend limit', () => {
    const input = profile();
    input.constraints.rentalAllowed = true;

    expect(() => parseProductionCapabilityProfile(input)).toThrow(/positive incremental spend limit/);
  });

  it('rejects unknown future contract versions explicitly', () => {
    expect(() => parseProductionCapabilityProfile({ ...profile(), version: 2 })).toThrow(/unsupported production capability profile version/);
  });
});
