import { describe, expect, it } from 'vitest';
import { cleanPromotedAudiencePhrase } from '../../lib/shared/brand-vault-draft-orchestrator';

// cleanPromotedAudiencePhrase gates which audience phrases get promoted into a
// brand profile. It used to require a B2B/creative keyword, so D2C audiences the
// LLM compiler correctly infers ("parents", "families", "men", "women") were
// dropped and consumer brands came back with an empty audience.
describe('Brand Vault audience phrase promotion', () => {
  it('keeps D2C/consumer audiences the compiler infers', () => {
    for (const phrase of [
      'parents',
      'new moms',
      'young men',
      'men',
      'women',
      'families',
      'gamers',
      'fitness enthusiasts',
      'pet owners',
      'first-time homeowners',
      'busy professionals',
    ]) {
      expect(cleanPromotedAudiencePhrase(phrase), phrase).toBeTruthy();
    }
  });

  it('still keeps the original B2B/creative audiences', () => {
    for (const phrase of ['marketing teams', 'product teams', 'agencies', 'creative studios', 'enterprises']) {
      expect(cleanPromotedAudiencePhrase(phrase), phrase).toBeTruthy();
    }
  });

  it('still rejects heuristic junk that is not an audience', () => {
    for (const phrase of [
      'better results',
      'track your order',
      'shop now',
      'the delivery status',
      'free shipping',
      'pimples every day for better results',
      // long promo blob: killed by the length cap before the allow-list
      'Mamaearth OMG Sale is live! Buy 1 Get 1 Free on skin, hair, baby care, and beauty care products.',
    ]) {
      expect(cleanPromotedAudiencePhrase(phrase), phrase).toBeUndefined();
    }
  });
});
