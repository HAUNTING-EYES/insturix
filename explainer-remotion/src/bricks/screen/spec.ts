// SCREEN SPEC — the data contract for a GENERATED product screen. GLM (from a Brand Vault / vision decode of
// the user's real UI) writes ONE of these as JSON per beat; the deterministic ScreenEngine renders it as a
// LIVE, brand-tokened app screen that types/clicks/counts/builds. This is how the premium product pixels get
// GENERATED (an idealized recreation of the user's product) instead of depending on assets we hand-made.
//
// Design: forms are SHELLS + BODIES + DEMO verbs. Geometry, colour, and timing live in the engine; the spec
// only says WHAT the screen is and WHAT it does. No raw px, no colours — brand tokens only, by construction.

export type BadgeTone = 'accent' | 'neutral' | 'positive'; // mapped to brand-derived colours by the engine
export type Badge = {kind: 'score' | 'status' | 'tag'; label?: string; value?: number; tone?: BadgeTone};

export type Card = {
  title: string;
  meta?: string; // e.g. "3h ago", "@acme"
  badge?: Badge;
  glyph?: string; // 1-char/emoji icon seed; engine derives from title[0] if omitted
};

export type KanbanColumn = {label: string; cards: Card[]};

// A body is the main content of the screen. Kanban is Phase 1 (matches the hand-built dashboard bar).
// chat-editor / metric / table / chart follow — each a real SaaS screen archetype.
export type Body =
  | {type: 'kanban'; columns: KanbanColumn[]}
  | {type: 'chat-editor'; canvasTitle?: string; prompt: string; toolCalls: string[]; tracks?: string[]}
  | {type: 'metric'; value: number; suffix?: string; label: string; sub?: string}
  | {type: 'list'; heading?: string; rows: {title: string; meta?: string; badge?: Badge}[]};

// Where the demo cursor goes + what it does. Targets are SEMANTIC (the engine resolves them to pixels), so the
// spec never hard-codes coordinates. `region` names a well-known target the body exposes.
export type CursorTarget =
  | {col: number; card: number; click?: boolean}
  | {region: 'primary-action' | 'chat-input' | 'send' | 'first-row'; click?: boolean};

export type Demo = {
  cursor?: CursorTarget[]; // the pointer path (last with click:true = the money click)
  typeInto?: 'chat-input'; // if set, the body's input typewrites `body.prompt`
  camera?: 'dive' | 'push' | 'none'; // dive = zoom toward the click target (hands off to the film's match cut)
};

export type ScreenSpec = {
  shell: {
    title: string; // product/section name shown in the header (e.g. "Production Floor")
    subtitle?: string; // small mono kicker (e.g. "EVERY VIDEO. ONE PIPELINE.")
    primaryAction?: string; // the one header button (e.g. "New project")
    chrome?: 'header' | 'window' | 'none'; // header = app top-bar; window = macOS traffic-lights bar
  };
  body: Body;
  demo?: Demo;
  focus?: {x: number; y: number}; // overridden by the resolved cursor target; used for the film's match-cut dive
};
