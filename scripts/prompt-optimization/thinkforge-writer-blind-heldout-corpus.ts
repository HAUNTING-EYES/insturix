import type { ThinkForgePlatformSurfaceId } from '../../lib/thinkforge/schemas/authoring-request';
import type { WriterEvalCase } from './thinkforge-writer-eval-scoring';

export type BlindHeldoutWriterEvalCase = WriterEvalCase & {
  suite: 'heldout';
  promotionCohort: 'blind_heldout';
};

export interface BlindHeldoutRequestFixture {
  platformSurface: ThinkForgePlatformSurfaceId;
  targetDurationSec?: number;
  voiceLanguages?: string[];
  captionLanguages?: string[];
  cta?: {
    preference: 'none' | 'soft' | 'direct';
    action?: string;
    destination?: string;
  };
  emoji?: 'none' | 'restrained';
}

export const ADDITIONAL_BLIND_HELDOUT_CASES: readonly BlindHeldoutWriterEvalCase[] = [
  {
    id: 24,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out regulated fintech evidence post',
    documentType: 'post',
    projectSummary: 'Cobalt Ledger is a synthetic close-management platform for mid-market finance teams.',
    userPrompt: [
      'Write a LinkedIn post for Cobalt Ledger about a bounded customer pilot.',
      'Across 28 controllers, median month-end evidence collection fell from 43 hours to 29 hours over one quarter.',
      'State clearly that this was an observed pilot result, not a guarantee for every finance team.',
      'Target CFOs and controllership leaders. Do not use fear, certainty, or audit-compliance promises.',
    ].join(' '),
    systemBrief: 'Brand: Cobalt Ledger. Voice: restrained, numerate, compliance-aware. Never turn observed evidence into a universal claim.',
    expectedPath: 'post',
    grounding: ['Cobalt Ledger', '28 controllers', '43 hours', '29 hours', 'one quarter', ['not a guarantee', 'no guarantee']],
    criteria: { groundingFloor: 0.8 },
  },
  {
    id: 25,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out nonprofit correction post',
    documentType: 'post',
    projectSummary: 'Open Table North is a synthetic mutual-aid pantry correcting an event-location error.',
    userPrompt: [
      'Write a Facebook correction for Open Table North.',
      'The Saturday pantry pickup is at Harbor School Gym, not the library. Doors open at 10am and close at 1pm.',
      'There are 240 grocery boxes. Existing registrations remain valid; new registrations use opentablenorth.org/pickup.',
      'Lead with the correction without blaming anyone, and make the logistics impossible to miss.',
    ].join(' '),
    systemBrief: 'Brand: Open Table North. Voice: accountable, calm, neighborly. Accuracy is more important than promotion.',
    expectedPath: 'post',
    grounding: ['Open Table North', 'Harbor School Gym', ['10am', '10 am', '10:00'], ['1pm', '1 pm', '13:00'], '240 grocery boxes', 'registrations remain valid', 'opentablenorth.org/pickup'],
    criteria: { groundingFloor: 0.82 },
  },
  {
    id: 26,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out evidence-sparse ecommerce caption',
    documentType: 'post',
    projectSummary: 'Morrow Field is a synthetic home-goods shop launching a linen table runner.',
    userPrompt: [
      'Write an Instagram caption for Morrow Field launching the Long Light linen table runner in Salt Blue.',
      'The only verified product facts are: 100% linen, 180 cm long, $64, and available on September 12.',
      'The photo shows a wrinkled runner on a shared breakfast table after the meal.',
      'Do not invent sustainability, origin, durability, or care claims. Send readers to morrowfield.example/long-light.',
    ].join(' '),
    systemBrief: 'Brand: Morrow Field. Voice: observant, lived-in, quietly useful. Never manufacture product proof.',
    expectedPath: 'post',
    grounding: ['Morrow Field', 'Long Light', 'Salt Blue', '100% linen', '180 cm', '$64', 'September 12', 'morrowfield.example/long-light'],
    criteria: { groundingFloor: 0.8 },
  },
  {
    id: 27,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out concise technical recruiting post',
    documentType: 'post',
    projectSummary: 'Relay Forge is a synthetic grid-software company hiring an unusual technical role.',
    userPrompt: [
      'Write a concise X post for Relay Forge hiring a Staff Power Systems Engineer in Glasgow.',
      'The role models distribution networks with incomplete sensor data. It is onsite three days a week.',
      'Applications close October 4 at relayforge.example/careers. Do not call the team world-class or mission-driven.',
    ].join(' '),
    systemBrief: 'Brand: Relay Forge. Voice: engineer-to-engineer, exact, understated. Avoid recruiting wallpaper.',
    expectedPath: 'post',
    grounding: ['Relay Forge', 'Staff Power Systems Engineer', 'Glasgow', 'incomplete sensor data', 'three days', 'October 4', 'relayforge.example/careers'],
    criteria: { groundingFloor: 0.78 },
  },
  {
    id: 28,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out French neighborhood workshop post',
    documentType: 'post',
    projectSummary: 'Maison du Code is a synthetic Marseille nonprofit running practical digital-skills workshops.',
    userPrompt: [
      'Écris un post Instagram en français pour Maison du Code.',
      'Atelier gratuit pour apprendre à repérer les arnaques en ligne, mercredi 18 novembre à 18 h 30, au 7 rue Sainte, Marseille.',
      'Il reste 16 places. Inscription: maisonducode.example/atelier. Le ton doit être rassurant, jamais alarmiste.',
    ].join(' '),
    systemBrief: 'Marque: Maison du Code. Voix: claire, locale, rassurante. Ne pas infantiliser le public.',
    expectedPath: 'post',
    grounding: ['Maison du Code', 'gratuit', 'arnaques en ligne', '18 novembre', ['18 h 30', '18h30'], '7 rue Sainte', 'Marseille', '16 places', 'maisonducode.example/atelier'],
    criteria: { groundingFloor: 0.78 },
  },
  {
    id: 29,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out agency causal-caveat case study',
    documentType: 'post',
    projectSummary: 'Pattern Room is a synthetic creative agency publishing a campaign postmortem.',
    userPrompt: [
      'Write a LinkedIn post for Pattern Room about testing 14 localized ad variants across three markets.',
      'The campaign recorded a 22% lower cost per qualified lead than the previous quarter.',
      'Do not claim the creative caused the whole improvement because targeting and seasonality also changed.',
      'Make the operating lesson useful to agency strategy and production teams, not a victory lap.',
    ].join(' '),
    systemBrief: 'Brand: Pattern Room. Voice: candid, analytical, generous with process. No agency chest-thumping.',
    expectedPath: 'post',
    grounding: ['Pattern Room', '14 localized ad variants', 'three markets', '22%', 'cost per qualified lead', 'targeting', 'seasonality'],
    criteria: { groundingFloor: 0.8 },
  },
  {
    id: 30,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out deadpan film-house announcement',
    documentType: 'post',
    projectSummary: 'Quiet Unit is a synthetic film house announcing a deliberately tiny screening.',
    userPrompt: [
      'Write a LinkedIn post in a dry, deadpan tone for Quiet Unit.',
      'We are screening three unfinished short films for 36 people on August 21 at Bay 4, East Dock.',
      'Doors are at 7pm. There will be no panel, awards, or networking segment; the directors will simply stay for questions.',
      'Tickets are at quietunit.example/bay4. Mildly amused is right; smug is wrong.',
    ].join(' '),
    systemBrief: 'Brand: Quiet Unit. Voice: spare, dry, film-literate. Understatement is non-negotiable.',
    expectedPath: 'post',
    grounding: ['Quiet Unit', 'three unfinished short films', '36 people', 'August 21', 'Bay 4', 'East Dock', ['7pm', '7 pm', '19:00'], 'quietunit.example/bay4'],
    criteria: { groundingFloor: 0.8 },
  },
  {
    id: 31,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out twelve-minute expert investigation',
    documentType: 'video_script',
    projectSummary: 'Signal Yard is a synthetic engineering channel examining heat-pump performance claims.',
    userPrompt: [
      'Write a 12-minute YouTube investigation for Signal Yard about why heat-pump efficiency figures vary in cold weather.',
      'Use only these supplied anchors: manufacturer ratings are measured under defined test conditions; installation quality and building heat loss affect field performance; one monitored home used 18% more electricity during a five-day cold snap than its seasonal weekly average.',
      'Do not generalize from one home. Include a cold open, a test-method explanation, a skeptical comparison, and a practical conclusion.',
      'Visual direction must be shootable with one host, one camera operator, a utility room, and simple charts.',
    ].join(' '),
    systemBrief: 'Brand: Signal Yard. Voice: technically curious, skeptical, accessible. Evidence boundaries must remain explicit.',
    expectedPath: 'script',
    grounding: ['Signal Yard', 'defined test conditions', 'installation quality', 'building heat loss', '18%', 'five-day cold snap', ['one home', 'single home']],
    criteria: { groundingFloor: 0.8 },
  },
  {
    id: 32,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out twenty-second constrained UGC script',
    documentType: 'video_script',
    projectSummary: 'Loop Clip is a synthetic cable organizer demonstrated in a small home office.',
    userPrompt: [
      'Write a 20-second vertical UGC script for Loop Clip using one creator, one phone, and a desk.',
      'The verified facts are that the pack contains six reusable silicone ties and costs $12.',
      'Show the messy-before and organized-after without inventing strength, safety, or longevity claims.',
      'Keep the spoken copy under 35 words and make every shot feasible for a self-shoot.',
    ].join(' '),
    systemBrief: 'Brand: Loop Clip. Voice: quick, practical, unpolished but clear. Product truth beats performance hype.',
    expectedPath: 'script',
    grounding: ['Loop Clip', 'six', 'reusable silicone ties', '$12'],
    criteria: { groundingFloor: 0.75, maximumSpokenWords: 35 },
  },
  {
    id: 33,
    suite: 'heldout',
    promotionCohort: 'blind_heldout',
    name: 'Held-out constrained agency dialogue film',
    documentType: 'video_script',
    projectSummary: 'Common Frame is a synthetic content team planning a founder interview under production limits.',
    userPrompt: [
      'Write a three-minute scene with exactly these speakers: Leena, the agency producer, Omar, the client lead, and Tess, the director.',
      'They must turn a vague founder-story request into a shoot plan for one office, two cameras, a four-hour location window, and no teleprompter.',
      'The founder is available from 2pm to 3pm. Let the disagreement reveal tradeoffs, then end with a concrete interview and b-roll plan.',
      'Do not add crew, locations, gear, or a narrator.',
    ].join(' '),
    systemBrief: 'Brand: Common Frame. Voice: candid, production-literate, collaborative. Constraints are facts, not inconveniences to ignore.',
    expectedPath: 'script',
    grounding: ['Common Frame', 'one office', 'two cameras', 'four-hour', 'no teleprompter', ['2pm to 3pm', '2 pm to 3 pm']],
    criteria: { groundingFloor: 0.78, requiredCharacterNames: ['Leena', 'Omar', 'Tess'] },
  },
];

export const ADDITIONAL_BLIND_HELDOUT_REQUEST_FIXTURES: Readonly<Record<number, BlindHeldoutRequestFixture>> = {
  24: { platformSurface: 'linkedin', cta: { preference: 'none' }, emoji: 'none' },
  25: {
    platformSurface: 'facebook',
    cta: { preference: 'direct', action: 'Register for pickup', destination: 'opentablenorth.org/pickup' },
    emoji: 'restrained',
  },
  26: {
    platformSurface: 'instagram',
    cta: { preference: 'direct', action: 'View Long Light', destination: 'morrowfield.example/long-light' },
    emoji: 'restrained',
  },
  27: {
    platformSurface: 'x',
    cta: { preference: 'direct', action: 'Apply by October 4', destination: 'relayforge.example/careers' },
    emoji: 'none',
  },
  28: {
    platformSurface: 'instagram',
    cta: { preference: 'direct', action: "S'inscrire", destination: 'maisonducode.example/atelier' },
    emoji: 'restrained',
  },
  29: { platformSurface: 'linkedin', cta: { preference: 'none' }, emoji: 'none' },
  30: {
    platformSurface: 'linkedin',
    cta: { preference: 'direct', action: 'Reserve a seat', destination: 'quietunit.example/bay4' },
    emoji: 'none',
  },
  31: {
    platformSurface: 'youtube',
    targetDurationSec: 720,
    voiceLanguages: ['en-US'],
    captionLanguages: ['en-US'],
  },
  32: {
    platformSurface: 'instagram',
    targetDurationSec: 20,
    voiceLanguages: ['en-US'],
    captionLanguages: ['en-US'],
  },
  33: {
    platformSurface: 'generic',
    targetDurationSec: 180,
    voiceLanguages: ['en-US'],
    captionLanguages: ['en-US'],
  },
};
