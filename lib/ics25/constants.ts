// Centralized pricing constants for ICS'25
// Keep these in sync with checkout UI and upgrade API

export type Ics25Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'creators';

export const ICS25_PASS_PRICES: Record<Ics25Tier, number> = {
  bronze: 0,
  silver: 0,  // Free but requires creator tasks
  gold: 2500,
  platinum: 5000,
  creators: 3000,
};

export const ICS25_GAMEON_PRICE = 500; // per paid player registration
