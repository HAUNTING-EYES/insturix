EDITRON — Director Agent Decision Knowledge Base
Comprehensive Video Editing Intelligence Reference
Version 1.0 — March 2026
PURPOSE
This document is the canonical decision-making reference for Editron's Director Agent
(Unified Intelligence Engine). It encodes the accumulated knowledge of professional film
editing, motion design, sound design, and visual storytelling into structured, machine-readable
rules that map directly to Editron's EDL (Edit Decision List) decision types.
Every rule follows the pattern:
CONDITION → what the AI observes in the project context (script, video analysis,
voiceover, mood, pacing)
ACTION → what EDL decision to produce
PARAMETERS → exact values to use
WEIGHT → how important this rule is relative to competing rules (1-10)
SOURCE → the professional editing principle behind it
The Director Agent must evaluate ALL applicable rules for each decision point, resolve conflicts
using the priority weight system, and cite which rules drove each decision in the EDL output.
PART 1: CORE PHILOSOPHY — THE HIERARCHY OF EDITING DECISIONS
1.1 Murch's Rule of Six (Priority Weights for ALL Decisions)
Every editing decision — whether it's a cut, a transition, a zoom, a graphic, or a speed change —
must be evaluated against Walter Murch's hierarchy. When two rules conflict, the one that serves
a higher-priority criterion wins.
Priority
Criterion
Weight
Description
1
Emotion
51%
Does this decision serve the emotional arc? Will the viewer FEEL
something at this moment?
2
Story
23%
Does this advance the narrative? Does the viewer understand what's
happening and why?
3
Rhythm
10%
Does this decision maintain or intentionally break the established
pacing pattern?
4
Eye-trace
7%
Does this respect where the viewer's eye is currently focused? Will
the next frame's point of interest be where the eye already is?
5
2D Plane
5%
Does the composition (screen direction, balance, rule of thirds) work
within the flat frame?
6
3D
Continuity
4%
Does spatial continuity make sense (180-degree rule, establishing
geography)?
CRITICAL IMPLEMENTATION RULE: If a decision scores high on criteria 3-6 but VIOLATES
criteria 1 or 2, it must be rejected. A perfectly rhythmic cut that kills the emotion is a BAD cut. A
technically beautiful transition that confuses the story is a BAD transition.
1.2 The Decisive Moment Principle
Every scene in a video has exactly ONE moment that matters most — the emotional peak, the
key information reveal, or the visual climax. ALL editing decisions within that scene should
serve that moment:
Decisions BEFORE the peak build anticipation (slower pacing, tighter framing, rising
energy)
The peak itself gets maximum emphasis (the zoom-punch, the camera-shake, the graphic
reveal, the SFX hit)
Decisions AFTER the peak provide release (wider framing, dissolve transition, speed
normalization)
The Director Agent must identify the decisive moment per scene from the voiceover content,
visual description, and mood metadata before making any decisions.
1.3 The Invisible Edit Principle
The best editing is editing the viewer doesn't consciously notice. Most decisions should feel
INEVITABLE — the viewer should feel like "of course it cut there" or "of course the text appeared
then." Conspicuous editing (visible transitions, aggressive shakes, flashy graphics) should be
RARE and INTENTIONAL.
Rule of thumb: In any 30-second video, no more than 2-3 decisions should be "loud" (aggressive
zoom-punch, flash transition, heavy camera shake). Everything else should be "quiet" (clean
cuts, subtle pushes, gentle dissolves).
1.4 Contrast Creates Impact
A fast cut only feels fast if the previous pacing was slower. A zoom-punch only hits if the
previous shot was static. A loud SFX only lands if the audio before it was quiet. The Director
Agent must maintain an awareness of the PREVIOUS decision state when making the current
decision.
Implementation: Track previousDecisionIntensity  as a running value (0.0 to 1.0). If the last
decision was high-intensity (>0.7), the next decision should default to low-intensity (<0.3)
unless the emotional arc explicitly demands sustained intensity (e.g., a climactic montage).
PART 2: DECISION TYPE REFERENCE
2.0 Complete EDL Decision Type Map
These are ALL decision types the Director Agent can produce. Each rule in this document
specifies which type(s) it triggers.
DECISION TYPES:
├── CUT                    → scene boundary marker, defines where one shot ends
and next begins
├── TRANSITION             → visual bridge between scenes/shots
│   ├── hard-cut           → instant switch (default, most common)
│   ├── dissolve           → cross-fade between shots (0.3-1.0s)
│   ├── dip-to-black       → fade out then fade in through black (0.5-1.5s)
│   ├── dip-to-white       → fade out then fade in through white (0.3-0.8s)
│   ├── zoom-punch         → rapid zoom into cut point (0.15-0.3s)
│   ├── wipe-left          → directional wipe (0.3-0.6s)
│   ├── wipe-right         → directional wipe (0.3-0.6s)
│   ├── wipe-up            → directional wipe (0.3-0.6s)
│   ├── wipe-down          → directional wipe (0.3-0.6s)
│   ├── flash              → white flash burst (0.1-0.2s)
│   ├── glitch             → digital glitch effect (0.2-0.4s)
│   ├── blur-transition    → defocus then refocus (0.4-0.8s)
│   ├── slide-left         → incoming pushes outgoing (0.3-0.5s)
│   ├── slide-right        → incoming pushes outgoing (0.3-0.5s)
│   ├── morph              → shape-morph between shots (0.5-1.0s)
│   ├── spin               → rotational transition (0.3-0.5s)
│   ├── iris               → circular reveal/close (0.4-0.8s)
│   ├── film-burn          → analog film burn overlay (0.5-1.0s)
│   ├── light-leak         → lens flare / light leak (0.4-0.8s)
│   └── swish-pan          → fast horizontal blur (0.2-0.4s)
├── ZOOM                   → scale change within a shot
│   ├── punch-in           → rapid zoom to 1.10x-1.20x (0.1-0.3s)
│   ├── slow-push          → gradual zoom to 1.03x-1.08x (1.0-3.0s)
│   ├── pull-back          → gradual zoom out to 0.85x-0.95x (1.0-3.0s)
│   ├── snap-zoom          → very fast zoom to 1.25x+ (0.05-0.15s)
│   └── drift-zoom         → barely perceptible to 1.01x-1.03x (full scene
duration)
├── SPEED-CHANGE           → temporal manipulation
│   ├── slow-mo            → 0.3x-0.7x speed (emphasis, beauty shots)
│   ├── speed-ramp-up      → accelerate from 1.0x to 1.5x-3.0x
│   ├── speed-ramp-down    → decelerate from 1.0x to 0.3x-0.7x
│   ├── freeze-frame       → 0.0x speed for 0.5-2.0s
│   └── time-lapse         → 2.0x-8.0x speed (process shots, transitions)
├── CAMERA-SHAKE           → simulated camera movement
│   ├── subtle             → amplitude 0.1-0.2, frequency 8-12Hz, decay 0.3-0.5s
│   ├── impact             → amplitude 0.3-0.5, frequency 15-20Hz, decay 0.2-0.4s
│   ├── aggressive          → amplitude 0.5-0.8, frequency 20-30Hz, decay 0.5-1.0s
│   └── handheld           → amplitude 0.05-0.1, continuous, no decay (organic
feel)
├── GRAPHIC                → visual overlay / motion graphic
│   ├── keyword-highlight  → text callout synced to voiceover word
│   ├── stat-counter       → animated number counting up/down
│   ├── lower-third        → name/title/label bar at bottom
│   ├── logo-reveal        → brand logo with entrance animation
│   ├── quote-card         → full-screen or partial text quote
│   ├── progress-bar       → horizontal/circular progress indicator
│   ├── comparison          → split-screen or side-by-side graphic
│   ├── bullet-list        → animated list items appearing sequentially
│   ├── icon-pop           → relevant icon with bounce/scale entrance
│   ├── data-chart         → animated bar/line/pie chart
│   ├── callout-box        → bordered text box with label
│   ├── arrow-pointer      → directional indicator to subject
│   ├── text-reveal        → word-by-word or letter-by-letter text appearance
│   ├── screen-mockup      → device frame with content inside
│   ├── before-after       → slider or split comparison
│   └── emoji-reaction     → floating emoji with physics (sparingly)
├── SFX-TRIGGER            → sound effect placement at exact frame
│   ├── whoosh             → transition/movement emphasis
│   ├── impact-hit         → bass-heavy punch on visual hit
│   ├── riser              → tension-building ascending tone
│   ├── reverse-cymbal     → anticipation builder before drop
│   ├── notification       → UI/digital element sound
│   ├── pop                → light, playful element appearance
│   ├── swoosh             → fast movement / swipe
│   ├── boom               → dramatic reveal / title card
│   ├── click              → button/selection/snap
│   ├── tape-stop          → audio slowdown effect
│   └── custom             → context-specific from SFX pipeline
├── CAPTION-EMPHASIS       → highlight word in voiceover captions
│   ├── color-highlight    → change word color (gold/accent)
│   ├── scale-up           → enlarge word temporarily
│   ├── bold-flash         → bold + slight glow
│   ├── underline-draw     → animated underline beneath word
│   └── shake-word         → subtle shake on single word
├── FILTER-CHANGE          → mood-based CSS filter application
│   ├── preset-switch      → change to named filter preset
│   ├── intensity-shift    → gradually adjust current filter intensity
│   └── color-wash         → temporary color tint overlay
└── AUDIO-DUCK             → volume automation
├── vo-priority        → duck music/SFX under voiceover (standard)
├── music-swell        → raise music in gaps between voiceover
PART 3: CUT AND TRANSITION RULES
3.1 The Default Is a Hard Cut
RULE T-001: Default to hard-cut
CONDITION: Any scene-to-scene boundary where no other rule applies
ACTION: TRANSITION → hard-cut
WEIGHT: 10
RATIONALE: Hard cuts are invisible. They maintain energy. They're what professional
editors use 80%+ of the time. The Director Agent should use hard cuts for at least 60-70% of
all transitions in any project.
RULE T-002: Cut on action
CONDITION: Video analysis detects significant motion (subject movement, gesture,
camera movement) near the scene boundary AND the motion direction continues logically
into the next scene
ACTION: TRANSITION → hard-cut, timed to the peak of the action (not the start, not the
end)
WEIGHT: 9
RATIONALE: (Murch) Cutting on action hides the edit because the viewer's brain is
tracking the movement. The eye follows the motion across the cut.
RULE T-003: Cut on the look
CONDITION: Video analysis detects a subject looking in a specific direction at scene end,
AND the next scene contains what they might be looking at
ACTION: TRANSITION → hard-cut
WEIGHT: 8
RATIONALE: The viewer's brain automatically creates cause-and-effect from shot/reverse-
shot patterns. This is the most fundamental rule of visual narrative.
3.2 When to Use Dissolves
RULE T-010: Time passage dissolve
├── sfx-punch-through  → brief music duck for impact SFX
└── silence-beat       → brief total audio drop for dramatic pause
CONDITION: Script/narration indicates passage of time between scenes ("later", "years
went by", "growing up", temporal shift in narrative, scene mood transitions from one era to
another)
ACTION: TRANSITION → dissolve, duration 0.5-0.8s
WEIGHT: 8
RATIONALE: Dissolves universally signify time passage or thematic connection. They tell
the viewer "time has moved forward" without needing to say it.
RULE T-011: Emotional continuity dissolve
CONDITION: Two adjacent scenes share the SAME emotional tone (both reflective, both
melancholic, both peaceful) AND the pacing is slow (scene duration > 4s each)
ACTION: TRANSITION → dissolve, duration 0.6-1.0s
WEIGHT: 6
RATIONALE: Dissolves connect scenes thematically. If two scenes "feel the same," a
dissolve reinforces that emotional continuity.
RULE T-012: NEVER dissolve between contrasting moods
CONDITION: Adjacent scenes have OPPOSING moods (happy → sad, energetic → calm,
tense → relieved)
ACTION: PROHIBIT dissolve. Use hard-cut or flash instead.
WEIGHT: 9 (override)
RATIONALE: A dissolve between contrasting moods creates emotional confusion. The
viewer's brain gets mixed signals during the crossfade. A clean cut respects the emotional
shift.
3.3 When to Use Dip-to-Black
RULE T-020: Chapter ending dip-to-black
CONDITION: Narrative reaches a clear chapter boundary (end of an act, conclusion of a
storyline, transition from "problem" to "solution" in AIDA/PAS structure)
ACTION: TRANSITION → dip-to-black, duration 0.8-1.2s
WEIGHT: 7
RATIONALE: Dip-to-black is the visual equivalent of a paragraph break. It signals "this
section is complete, something new begins."
RULE T-021: Emotional weight dip-to-black
CONDITION: Scene ends on a moment of high emotional weight (a reveal, a loss, a
profound statement) AND the next scene shifts context entirely
ACTION: TRANSITION → dip-to-black, duration 1.0-1.5s
WEIGHT: 8
RATIONALE: The black frames give the viewer time to absorb what they just experienced
before moving to new content. Rushing past heavy moments diminishes their impact.
RULE T-022: NEVER dip-to-black in montage sequences
CONDITION: Current section is a rapid montage (3+ scenes in under 8 seconds)
ACTION: PROHIBIT dip-to-black. Kills momentum entirely.
WEIGHT: 10 (hard override)
3.4 When to Use Zoom-Punch / Flash / Glitch
RULE T-030: Energy spike zoom-punch
CONDITION: BGM analysis detects a beat drop, bass hit, or energy spike AND scene
boundary aligns within 2 frames of the beat AND edit profile is high-energy (YouTube
Shorts, TikTok, Reels, Gaming, Neon-Punk)
ACTION: TRANSITION → zoom-punch, duration 0.15-0.25s
WEIGHT: 8
RATIONALE: Zoom-punches are the visual equivalent of an exclamation mark. They work
when synchronized with audio energy. WITHOUT audio sync, they feel random and
amateur.
RULE T-031: Impact flash
CONDITION: Voiceover delivers a key statement/statistic/punchline AND the visual
changes simultaneously
ACTION: TRANSITION → flash, duration 0.1-0.15s
WEIGHT: 7
RATIONALE: A white flash is a micro-interruption that signals "pay attention to what
comes next." It's the visual equivalent of a drumroll.
RULE T-032: Glitch for digital/tech contexts only
CONDITION: Edit profile is tech-related (SaaS, Gaming, Neon-Punk, Motion Graphics) OR
script content discusses technology, digital concepts, errors, or disruption
ACTION: TRANSITION → glitch, duration 0.2-0.3s
WEIGHT: 6
RATIONALE: Glitch transitions are genre-specific. Using them in a food video or real estate
tour looks absurd. They belong in tech, gaming, and cyberpunk aesthetics ONLY.
RULE T-033: NEVER use flashy transitions consecutively
CONDITION: Previous transition was zoom-punch, flash, glitch, spin, or swish-pan
ACTION: FORCE next transition to hard-cut or dissolve
WEIGHT: 10 (hard override)
RATIONALE: Two consecutive flashy transitions cancel each other out. Impact requires
contrast. A zoom-punch after a zoom-punch just looks twitchy.
3.5 Swish Pan and Wipe Rules
RULE T-040: Swish pan for same-location transitions
CONDITION: Two adjacent scenes are in the same conceptual location but showing
different subjects/angles AND pacing is moderate-to-fast
ACTION: TRANSITION → swish-pan, duration 0.2-0.3s
WEIGHT: 6
RATIONALE: A swish pan implies the camera quickly turned to look at something else in
the same space. It maintains spatial continuity.
RULE T-041: Directional wipe for list/sequence content
CONDITION: Content is a listicle, numbered sequence, or progression (steps, tips, items)
AND the current scene represents one item transitioning to the next
ACTION: TRANSITION → wipe-left or wipe-right, duration 0.3-0.5s, direction matching the
reading direction (left-to-right in LTR languages)
WEIGHT: 5
RATIONALE: Wipes suggest forward movement through a sequence. They're spatial
transitions that work well for "next item" moments.
3.6 Film-Burn and Light-Leak for Vintage/Nostalgia
RULE T-050: Film-burn for memory/nostalgia
CONDITION: Scene mood is "nostalgic", "warm", "memory", "vintage" OR filter preset is
vintage-film/golden-hour AND transition connects to a memory/flashback scene
ACTION: TRANSITION → film-burn, duration 0.6-0.9s
WEIGHT: 6
RATIONALE: Film burns evoke analog photography and old home movies. They're the
perfect transition for content that references the past.
RULE T-051: Light-leak for dreamy/aspirational
CONDITION: Scene mood is "dreamy", "aspirational", "hopeful", "ethereal" AND pacing is
slow-to-moderate
ACTION: TRANSITION → light-leak, duration 0.5-0.7s
WEIGHT: 5
PART 4: ZOOM AND CAMERA MOVEMENT RULES
4.1 The Push-In (Slow Zoom)
RULE Z-001: Push-in for engagement/intensity building
CONDITION: Scene contains a speaker/subject delivering important content AND scene
duration > 2.5s AND no explicit camera movement detected in video analysis
ACTION: ZOOM → slow-push, scale 1.03x-1.06x over scene duration
WEIGHT: 7
RATIONALE: A slow push-in subconsciously increases viewer engagement. It creates a
feeling of "getting closer" to the subject, building intimacy or intensity. This is the single
most useful default camera move for talking-head and voiceover content.
RULE Z-002: Push-in acceleration toward decisive moment
CONDITION: The scene's decisive moment (emotional peak, key reveal) is in the latter half
of the scene
ACTION: ZOOM → slow-push with easing curve (ease-in), starting at 1.0x, reaching 1.06x-
1.10x at the decisive moment
WEIGHT: 8
RATIONALE: The acceleration of the push-in mirrors the building of tension. The viewer
feels the importance increasing.
4.2 The Punch-In (Fast Zoom)
RULE Z-010: Punch-in on voiceover emphasis words
CONDITION: Voiceover word-level timestamps identify a word with emphasis markers
(higher volume, key noun, number, brand name) AND current shot is medium or wide (not
already close-up)
ACTION: ZOOM → punch-in, scale 1.10x-1.15x, duration 0.15-0.25s, with elastic easeOut
WEIGHT: 7
RATIONALE: A punch-in is the visual equivalent of bold text. It says "THIS word matters."
But it only works if there's room to zoom — punching in on an already tight shot looks like a
glitch.
RULE Z-011: NEVER punch-in more than 3 times per 30-second video
CONDITION: Punch-in count in current project > 3 per 30s of timeline
ACTION: PROHIBIT additional punch-ins. Use caption-emphasis instead.
WEIGHT: 10 (hard override)
RATIONALE: Overusing punch-ins is the #1 sign of amateur "YouTube editor" work. Every
punch-in that isn't earned dilutes the ones that are.
4.3 The Pull-Back (Zoom Out)
RULE Z-020: Pull-back for reveal/context
CONDITION: Scene transitions from specific detail to broader context ("zooming out"
narratively) OR voiceover uses phrases like "the bigger picture", "when you step back",
"looking at it all"
ACTION: ZOOM → pull-back, scale 0.90x-0.95x from an initial 1.05x-1.10x, duration 1.5-3.0s
WEIGHT: 6
RATIONALE: Visual zoom direction should match narrative zoom direction. If the story is
"zooming out," the camera should too.
RULE Z-021: Pull-back for scene endings
CONDITION: Scene is the final scene OR a chapter-ending scene AND mood is
reflective/conclusive
ACTION: ZOOM → pull-back, scale 0.92x from 1.0x over final 2-3 seconds
WEIGHT: 5
RATIONALE: Pulling back at the end creates a sense of closure, like the camera is "leaving"
the scene.
4.4 Drift Zoom (Ken Burns)
RULE Z-030: Drift zoom on static images / storyboard-animated shots
CONDITION: Asset is a static image (storyboard, photo, stock image) being used as a scene
AND scene duration > 2s
ACTION: ZOOM → drift-zoom, scale 1.02x-1.04x over full scene duration, with gentle pan
(optional)
WEIGHT: 9
RATIONALE: Static images look dead on screen. Even 2-3% of slow movement makes them
feel alive. This is non-negotiable for ANY scene using a still image.
RULE Z-031: NEVER apply drift zoom to video with existing camera motion
CONDITION: 5-Track analysis detects camera motion (pan, tilt, dolly) in the video asset
ACTION: PROHIBIT drift-zoom. The existing motion is sufficient.
WEIGHT: 10 (hard override)
RATIONALE: Adding zoom to already-moving footage creates sea-sickness. Let the
original camera work speak.
4.5 Snap Zoom
RULE Z-040: Snap zoom for comedy/shock/exclamation
CONDITION: Voiceover delivers a punchline, joke, or exclamatory statement AND edit
profile allows high-energy cuts (YouTube Shorts, TikTok, Gaming, Comedy)
ACTION: ZOOM → snap-zoom, scale 1.20x-1.30x, duration 0.05-0.1s, with overshoot bounce
WEIGHT: 6
RATIONALE: Snap zooms are comedic punctuation. They're the visual equivalent of the
"record scratch" or "dun dun dun" moment. Genre-specific — never use in corporate,
documentary, or cinematic profiles.
PART 5: SPEED CHANGE RULES
5.1 Slow Motion
RULE S-001: Slow-mo for emotional peak moments
CONDITION: Scene contains THE decisive emotional moment of the video (not just any
emotional moment — THE peak) AND video has sufficient frame rate for smooth
slowdown (24fps minimum)
ACTION: SPEED-CHANGE → slow-mo, 0.4x-0.6x, duration 1.5-3.0s
WEIGHT: 8
RATIONALE: Slow motion stretches time, forcing the viewer to sit with a moment longer. It
says "this matters enough to slow down the entire world for." Use it ONCE per video,
maximum twice.
RULE S-002: NEVER slow-mo AI-generated video below 0.5x
CONDITION: Asset is AI-generated (Kling, Wan, Veo, etc.)
ACTION: CLAMP slow-mo minimum to 0.5x. Prefer 0.6x-0.7x.
WEIGHT: 10 (hard override)
RATIONALE: AI-generated video typically has motion artifacts that become obvious at
very slow speeds. The interpolation breaks down. Keep slow-mo subtle on AI footage.
5.2 Speed Ramps
RULE S-010: Speed ramp into impact moment
CONDITION: Scene has a visual impact point (collision, reveal, arrival) preceded by
approach/buildup
ACTION: SPEED-CHANGE → speed-ramp-up (1.5x-2.0x) during approach, then instant cut
to normal or slow-mo at impact
WEIGHT: 7
RATIONALE: Speed ramping compresses unimportant time (the approach) and expands
important time (the impact). It's the temporal version of close-up vs. wide shot.
RULE S-011: Speed ramp between scenes for energy bridge
CONDITION: Transitioning from a slow/calm scene to a high-energy scene AND transition
type is hard-cut or zoom-punch
ACTION: SPEED-CHANGE → speed-ramp-up on outgoing scene (last 0.5s at 1.5x-2.0x),
normal speed on incoming
WEIGHT: 6
RATIONALE: Accelerating the end of a slow scene creates a "launch pad" effect into the
next scene. It prevents the energy jump from feeling abrupt.
5.3 Freeze Frame
RULE S-020: Freeze frame for graphic overlay moments
CONDITION: A GRAPHIC decision (stat-counter, keyword-highlight, callout-box) is being
placed on a video scene AND the subject needs to remain visible behind the graphic
ACTION: SPEED-CHANGE → freeze-frame for graphic duration (0.5-2.0s), unfreeze after
graphic exit
WEIGHT: 7
RATIONALE: Graphics placed on moving video are hard to read. Freezing the frame while a
graphic is displayed ensures the viewer can process both the visual and the text. This is the
Hormozi/Iman Gadzhi signature move.
RULE S-021: Freeze frame with zoom for "record scratch" moment
CONDITION: Voiceover includes a self-referential pause, rhetorical question, or "wait,
what?" moment AND edit profile allows comedic elements
ACTION: SPEED-CHANGE → freeze-frame (1.0-1.5s) + ZOOM → punch-in (1.10x) + SFX-
TRIGGER → tape-stop
WEIGHT: 6
COMBINATION RULE: This triggers three decision types simultaneously.
RATIONALE: The classic internet meme editing trope. Freeze + zoom + tape-stop sound.
Effective for engagement in short-form content.
PART 6: CAMERA SHAKE RULES
6.1 Impact Shake
RULE CS-001: Impact shake on bass hits
CONDITION: BGM analysis detects bass hit/kick drum AND visual content has an impact
moment within 2 frames AND edit profile is high-energy
ACTION: CAMERA-SHAKE → impact, amplitude 0.3-0.4, frequency 18Hz, decay 0.3s
WEIGHT: 7
RATIONALE: Camera shake is the physical manifestation of sonic energy. When the bass
hits, the screen should respond. But ONLY when the visual content supports it — shaking
on a quiet dialogue scene because the music is loud feels disconnected.
RULE CS-002: Impact shake on text/graphic slam
CONDITION: A GRAPHIC decision involves a "slam" entrance animation (keyword
appearing with scale overshoot, stat-counter landing on final number)
ACTION: CAMERA-SHAKE → subtle-to-impact, amplitude 0.2-0.3, frequency 15Hz, decay
0.2s, triggered at the moment the graphic "lands"
WEIGHT: 6
RATIONALE: When a text element "slams" into frame, a subtle screen shake sells the
physical weight of the element. Without it, the slam animation feels floaty.
6.2 Subtle Shake / Handheld
RULE CS-010: Handheld shake for authenticity
CONDITION: Edit profile is "Raw Footage", "Documentary", or the scene mood is "raw",
"authentic", "energetic" AND the video asset is static (tripod/AI-generated with no natural
movement)
ACTION: CAMERA-SHAKE → handheld, amplitude 0.05-0.08, continuous, no decay
WEIGHT: 4
RATIONALE: Perfectly static footage looks "robotic" in certain contexts. A barely-
perceptible handheld wobble adds life to static shots, especially AI-generated footage that's
too clean.
RULE CS-011: NEVER shake during text-heavy scenes
CONDITION: Scene has active captions AND a graphic overlay simultaneously
ACTION: PROHIBIT all camera shake
WEIGHT: 10 (hard override)
RATIONALE: Text on a shaking screen is unreadable and nauseating. When the viewer
needs to read, the frame must be stable.
6.3 Shake Budget
RULE CS-020: Maximum shake budget per video
CONDITION: Global constraint
ACTION: Maximum 4 camera shake decisions per 30 seconds of timeline. Maximum 2
"impact" or "aggressive" shakes per 30 seconds. The rest must be "subtle" or "handheld."
WEIGHT: 10 (hard override)
RATIONALE: Excessive camera shake is the fastest way to make a video look amateur. It
triggers motion sickness in sensitive viewers. Less is more.
PART 7: GRAPHICS AND OVERLAY RULES
7.1 The Hormozi/Iman Gadzhi Style — Keyword Graphics
RULE G-001: Keyword highlight on voiceover power words
CONDITION: Voiceover word-level timestamps identify words that are: numbers/statistics,
brand names, key nouns in an argument, or emotional trigger words ("free", "guaranteed",
"secret", "proven", "million") AND edit profile supports graphics (not Cinematic, Film Noir,
Minimalist)
ACTION: GRAPHIC → keyword-highlight, synced to word start timestamp, duration = word
duration + 0.5s hold, entrance = scale-up from 0.8x with elastic ease, exit = fade-out over
0.3s
PARAMETERS: Position above or below the caption line. Color = accent color from edit
profile or gold (
#FFD700 ) default. Font = bold sans-serif (League Spartan, Inter,
Montserrat).
WEIGHT: 7
RATIONALE: Keyword highlights are the defining element of modern short-form video
editing. They reinforce important words visually, increasing retention. But they must be
SYNCED to voiceover timing — a keyword that appears 0.5s late looks broken.
RULE G-002: Maximum keyword density
CONDITION: Global constraint
ACTION: Maximum 1 keyword highlight per 3 seconds of timeline. In a 30s video, that's 8-
10 maximum. Prefer 5-7 for cleaner feel.
WEIGHT: 9 (override)
RATIONALE: Every word being highlighted means nothing is highlighted. The viewer
stops reading them after the 4th one if they're too frequent.
RULE G-003: Keyword hierarchy (size indicates importance)
CONDITION: Multiple keyword highlights in same video
ACTION: Vary size by importance:
Primary keywords (the MOST important fact/number): 1.3x-1.5x base size
Secondary keywords (supporting points): 1.0x base size
Tertiary keywords (flavor words): 0.8x base size
WEIGHT: 6
RATIONALE: Visual hierarchy prevents graphic monotony. If every keyword is the same
size, the viewer can't tell what matters most.
7.2 Stat Counters and Data Visualization
RULE G-010: Stat counter on number mentions
CONDITION: Voiceover mentions a specific number, percentage, or dollar amount AND the
number is central to the point being made (not incidental)
ACTION: GRAPHIC → stat-counter, counting from 0 to target number, duration 1.0-1.5s,
format matches context ($, %, x, plain), entrance = fade-up, exit = fade-out after 1.0s hold
PARAMETERS: Position = upper-third or center-screen (NOT overlapping captions). Use
monospace or tabular-nums font for digit alignment. Size = large enough to be primary
visual focus during animation.
WEIGHT: 7
RATIONALE: Animated counters are more engaging than static numbers. The counting
animation itself adds anticipation ("how high will it go?").
RULE G-011: Stat counter with freeze frame
CONDITION: RULE G-010 triggers AND video behind is not crucial to understanding
ACTION: Combine with SPEED-CHANGE → freeze-frame for counter duration + 0.5s
WEIGHT: 6
RATIONALE: Stopping the video ensures the viewer focuses on the number. This is the
Hormozi signature pattern: freeze → counter animates → hold → unfreeze.
7.3 Lower Thirds and Identification
RULE G-020: Lower third for new speaker/subject
CONDITION: Scene introduces a new person, brand, product, or location AND it's their first
appearance in the video
ACTION: GRAPHIC → lower-third, entrance = slide-in from left over 0.3s, hold for 2.0-3.0s,
exit = slide-out to left over 0.3s
PARAMETERS: Position = bottom-left or bottom-center. Two-line format: Line 1 = name
(bold), Line 2 = title/description (regular weight). Background = semi-transparent dark bar
(rgba(0,0,0,0.6)) or brand color.
WEIGHT: 6
RULE G-021: NEVER stack lower-third with active captions
CONDITION: Lower-third placement would overlap with auto-captions
ACTION: Either (a) temporarily hide captions during lower-third, or (b) move lower-third
to upper position, or (c) delay lower-third until caption line moves
WEIGHT: 9 (override)
RATIONALE: Two text elements competing for the bottom of the screen = unreadable
mess.
7.4 Animated Lists and Bullet Points
RULE G-030: Animated bullet list for sequential content
CONDITION: Voiceover is listing items ("first... second... third..." or "there are three things
you need to know") AND edit profile supports graphics
ACTION: GRAPHIC → bullet-list, each item entering as voiceover mentions it, entrance =
slide-in-from-right with 0.2s stagger between items, hold all visible until list complete, exit
= fade-out together
PARAMETERS: Position = right-side of screen or center. Style = numbered or bulleted
based on voiceover language. Font size = readable but not dominant (18-24px equivalent).
WEIGHT: 6
RATIONALE: Animated lists turn verbal information into spatial information. The viewer
can see all items at once and understand the structure.
7.5 Screen Mockups (SaaS/Tech Content)
RULE G-040: Screen mockup for product/app discussions
CONDITION: Voiceover discusses a website, app, dashboard, or software interface AND
edit profile is SaaS, tech, or product-related
ACTION: GRAPHIC → screen-mockup, device frame (laptop, phone, or browser window)
with content area showing relevant imagery, entrance = 3D rotation from slight angle to flat
(0.5s), optional subtle float animation
PARAMETERS: Device type inferred from context ("app" = phone, "website"/"dashboard" =
laptop/browser). Content = either uploaded screenshot or placeholder with gradient + text.
WEIGHT: 7
RATIONALE: This is the signature SaaS video element. Showing a product in a device
frame makes it feel real and premium. The 3D rotation entrance (Lovable/Linear style) adds
sophistication.
7.6 Graphic Placement Rules (Global)
RULE G-100: Screen zone management
CONDITION: Any GRAPHIC decision
ACTION: Check all active overlays and ensure no zone overlap:
ZONE 1 (Top 20%): Available for stat-counters, callout-boxes, keyword-highlights
ZONE 2 (Center 40%): Available for quote-cards, screen-mockups, before-after
ZONE 3 (Bottom 20%): Reserved for captions and lower-thirds — NO other graphics
ZONE 4 (Left/Right 15% margins): Available for bullet-lists, icon-pops, arrows
SAFE ZONE: Keep all critical content within 90% of frame (5% margin on all sides) for
mobile viewing
WEIGHT: 10 (hard override)
RATIONALE: Overlapping graphics are the hallmark of amateur editing. Professional
motion design respects screen real estate.
RULE G-101: Maximum simultaneous overlays
CONDITION: Any GRAPHIC decision
ACTION: Maximum 2 graphic overlays visible simultaneously (excluding captions). If a
third graphic needs to appear, the oldest one must exit first.
WEIGHT: 9 (override)
RATIONALE: Visual clutter kills comprehension. Two overlays + captions is already a lot
for the viewer to process.
RULE G-102: Graphic breathing room
CONDITION: Any GRAPHIC decision
ACTION: Minimum 1.5 seconds between one graphic's exit and the next graphic's entrance
(unless they are part of the same compound decision, e.g., freeze-frame + stat-counter)
WEIGHT: 7
RATIONALE: Rapid-fire graphics feel exhausting. Give the viewer's eyes time to return to
the primary video content between graphic appearances.
PART 8: CAPTION AND TYPOGRAPHY RULES
8.1 Auto-Caption Styling
RULE C-001: Default caption style from edit profile
CONDITION: Any project with voiceover
ACTION: Apply caption style based on edit profile:
YouTube Shorts / TikTok / Instagram Reels → "hormozi" style (bold white, gold
keyword highlight, centered, League Spartan, 2-3 words per line)
YouTube Long Form → "subtitle" style (white with black outline, bottom-center, 6-8
words per line)
Corporate / LinkedIn → "corporate" style (clean white, semi-transparent background
bar, bottom-center)
E-Learning → "ali-abdaal" style (clean sans-serif, subtle background, centered)
Cinematic / Film Noir → "minimal" style (thin white, bottom-left, elegant serif font)
Gaming → "mrbeast" style (bold, colorful, animated entrance per word)
WEIGHT: 8
8.2 Caption Emphasis
RULE C-010: Color-highlight on power words in captions
CONDITION: Voiceover word is tagged as a keyword (same detection as RULE G-001) AND
captions are active
ACTION: CAPTION-EMPHASIS → color-highlight on that word, color = gold (
#FFD700 )
or edit profile accent color
WEIGHT: 7
RATIONALE: Caption color-highlighting is the lightest form of emphasis — less intrusive
than a keyword graphic overlay. It should be the DEFAULT emphasis mechanism. Only
escalate to a GRAPHIC overlay when the word is critically important.
RULE C-011: Scale-up on exclamatory words
CONDITION: Voiceover word is spoken with emphasis (detected via audio amplitude spike
at word timestamp) AND word is an adjective, exclamation, or emotional word
ACTION: CAPTION-EMPHASIS → scale-up, 1.2x-1.4x, duration = word duration, ease =
elastic
WEIGHT: 5
RULE C-012: Caption emphasis budget
CONDITION: Global constraint
ACTION: Maximum 1 caption emphasis per sentence. In a 30s video, maximum 8-10
caption emphases total.
WEIGHT: 9 (override)
RATIONALE: If every other word is emphasized, nothing is. Caption emphasis must be
selective.
8.3 Kinetic Typography
RULE C-020: Kinetic typography for quote/statement scenes
CONDITION: Scene is primarily a spoken statement with no visual subject (voiceover over
abstract/ambient visuals) AND the statement is quotable/impactful AND edit profile
supports fancy captions
ACTION: Switch from standard captions to kinetic typography mode for that scene:
Word-by-word reveal synced to voiceover timestamps
Each word scales in from 0.5x to 1.0x with slight overshoot
Key words get larger size and accent color
Position = center screen (not bottom)
WEIGHT: 6
RATIONALE: When there's nothing visually compelling in the scene, kinetic typography
BECOMES the visual content. It turns the words themselves into the spectacle.
PART 9: AUDIO AND SFX RULES
9.1 Whoosh and Transition SFX
RULE A-001: Whoosh on every non-hard-cut transition
CONDITION: Transition is dissolve, wipe, slide, swish-pan, or film-burn (NOT hard-cut,
NOT dip-to-black)
ACTION: SFX-TRIGGER → whoosh, timed to transition midpoint, volume = -12dB to -8dB
(subtle, not dominant)
WEIGHT: 7
RATIONALE: Transition SFX sell the motion. A wipe without a whoosh feels incomplete. A
swish-pan without a swoosh is silent and weird. But keep it SUBTLE — the SFX should be
felt, not consciously heard.
RULE A-002: Impact hit on zoom-punch and flash transitions
CONDITION: Transition is zoom-punch or flash
ACTION: SFX-TRIGGER → impact-hit (deep bass thud), timed to transition point, volume =
-6dB to -3dB (more prominent than whoosh)
WEIGHT: 7
RATIONALE: Hard, percussive transitions need hard, percussive sounds. The audio and
visual must agree on the energy level.
9.2 Riser and Anticipation SFX
RULE A-010: Riser before major reveals
CONDITION: Next scene is a reveal, climax, or payoff (detected from script structure: the
scene after "the problem" in PAS, the resolution in 3-Act, the result in Before-After) AND
transition includes a brief pause or dip-to-black
ACTION: SFX-TRIGGER → riser, starting 1.5-2.0s before the reveal scene, ending at the
transition point, volume = fade from -18dB to -6dB
WEIGHT: 6
RATIONALE: Risers are anticipation machines. They tell the viewer's subconscious
"something is coming." But they MUST pay off — a riser that leads to nothing is worse than
no riser at all.
RULE A-011: Reverse-cymbal before beat drops
CONDITION: BGM analysis predicts a beat drop or energy shift in the next 1-2 seconds
AND edit profile is music-aware (TikTok, Reels, Gaming, Montage)
ACTION: SFX-TRIGGER → reverse-cymbal, duration 1.0-1.5s, ending exactly at the beat
drop
WEIGHT: 5
9.3 UI and Notification SFX
RULE A-020: Pop/notification SFX on graphic entrances
CONDITION: A GRAPHIC decision has an entrance animation (keyword-highlight, icon-
pop, bullet-list item appearing) AND edit profile is not cinematic/documentary
ACTION: SFX-TRIGGER → pop or notification (genre-appropriate), timed to graphic
entrance completion (not start), volume = -12dB to -9dB
WEIGHT: 5
RATIONALE: A soft "pop" when a text element appears gives it weight and presence.
Without it, animated overlays feel like they're floating in a vacuum. But the SFX must be
SUBTLE and pleasant — harsh digital sounds are grating.
RULE A-021: Click SFX on stat-counter completion
CONDITION: A stat-counter graphic finishes counting and "lands" on its final number
ACTION: SFX-TRIGGER → click or subtle impact-hit, timed to the final number display
WEIGHT: 5
RATIONALE: The "landing" sound gives finality to the counting animation. It says "done,
here's the number."
9.4 Audio Ducking
RULE A-030: Standard voiceover ducking
CONDITION: Voiceover is active AND background music is playing
ACTION: AUDIO-DUCK → vo-priority, duck BGM to -18dB to -15dB under voiceover, ramp
down = 300ms, ramp up = 600ms
WEIGHT: 10 (hard rule)
RATIONALE: Voiceover must ALWAYS be clearly audible above music. The asymmetric
ramp (fast duck, slow return) is critical — the fast duck ensures immediate clarity when
speaking starts, and the slow return prevents the music "pumping" effect.
RULE A-031: Music swell in voiceover gaps
CONDITION: Gap between voiceover segments > 1.5 seconds AND BGM is playing
ACTION: AUDIO-DUCK → music-swell, raise BGM to -6dB to -3dB during gap, ramp up =
400ms, ramp down = 300ms
WEIGHT: 6
RATIONALE: Silence between voiceover lines feels empty. Letting the music breathe up
fills the gap and maintains energy. But the swell must recede BEFORE the next voiceover
line starts.
RULE A-032: Silence beat for dramatic pause
CONDITION: Voiceover has a deliberate pause > 1.0s AND the content before the pause is a
question or dramatic statement AND the content after is the answer or resolution
ACTION: AUDIO-DUCK → silence-beat, drop ALL audio (BGM, SFX) to -30dB for 0.5-0.8s
centered on the pause midpoint, then bring music back in at the voiceover return
WEIGHT: 7
RATIONALE: Total silence is the most powerful audio tool. In a world of constant sound, a
moment of nothing makes the viewer lean in. Use this for "mic drop" moments.
9.5 SFX Budget
RULE A-100: Global SFX density limit
CONDITION: Global constraint
ACTION: Maximum 15 SFX events per 30 seconds. Of those, maximum 5 should be
"prominent" (volume > -9dB). The rest should be subtle support.
WEIGHT: 9 (override)
RATIONALE: Too many sound effects create a cacophony that the brain stops processing.
Each SFX should be individually perceivable. If you can't identify what sound just played,
there are too many sounds.
PART 10: FILTER AND COLOR RULES
10.1 Filter Preset Application
RULE F-001: Apply filter preset from scene mood
CONDITION: Scene has a mood tag from script parsing
ACTION: FILTER-CHANGE → preset-switch:
"happy" / "energetic" / "playful" → warm-vibrant or golden-hour
"sad" / "melancholic" / "reflective" → cool-desat or blue-hour
"intense" / "dramatic" / "tense" → high-contrast or teal-orange
"nostalgic" / "memory" / "warm" → vintage-film or golden-hour with grain
"professional" / "corporate" / "clean" → minimal-grade (slight contrast boost, neutral
colors)
"dark" / "edgy" / "mysterious" → noir or dark-cinema
"dreamy" / "ethereal" / "aspirational" → soft-glow or pastel-wash
"raw" / "authentic" / "documentary" → minimal processing or slight desat
"tech" / "futuristic" / "cyberpunk" → neon-punk or cyan-magenta
WEIGHT: 5 (LOW — filter is the backdrop, not the star)
RULE F-002: Filter consistency within narrative sections
CONDITION: Multiple consecutive scenes share the same narrative section (e.g., all
"problem" scenes in PAS, all "childhood memory" scenes in a nostalgia video)
ACTION: Apply the SAME filter preset across all scenes in that section. Transition filter
only when the narrative section changes.
WEIGHT: 8
RATIONALE: Constantly shifting colors makes a video feel incoherent. Filters should
change with meaning, not randomly per scene.
RULE F-003: Filter transition matches narrative transition
CONDITION: Narrative shifts between sections (problem → solution, past → present, setup
→ payoff)
ACTION: FILTER-CHANGE → intensity-shift over 0.5-1.0s, cross-transitioning from old
filter to new filter
WEIGHT: 6
RATIONALE: The color shift reinforces the narrative shift. When the story moves from "the
problem" (cool, desaturated) to "the solution" (warm, vibrant), the color should move with
it.
10.2 Filter Anti-Patterns
RULE F-010: NEVER apply aggressive filters to product close-ups
CONDITION: Scene is a product shot, food close-up, or brand visual AND a filter would
significantly alter the product's actual color
ACTION: PROHIBIT heavy filtering. Maximum: subtle contrast boost and slight warmth.
Product colors must remain TRUE.
WEIGHT: 10 (hard override)
RATIONALE: If a client's product is red and your filter makes it orange, the client will reject
the video. Brand colors are sacred.
RULE F-011: NEVER use more than 2 distinct filter presets in a video under 60s
CONDITION: Video duration < 60 seconds
ACTION: Maximum 2 filter presets. One dominant + one for a contrasting section.
WEIGHT: 9 (override)
RATIONALE: Short videos don't have time to establish multiple color worlds. More than 2
filters in 30-60 seconds looks like a filter sampler, not a coherent video.
PART 11: PACING AND RHYTHM RULES
11.1 Scene Duration from Content Type
RULE P-001: Base scene duration from content density
CONDITION: Scene duration needs to be determined/validated
ACTION: Apply base durations:
Talking head / direct address: 3-5s per scene
B-roll / ambient / establishing: 2-4s per scene
Montage shots: 1-2s per shot (multiple shots per scene)
Product close-up: 2-3s per scene
Data/graphic-heavy: 3-5s (viewer needs read time)
Emotional payoff / climax: 4-6s (give it space to breathe)
Opening hook: 1-3s (FAST, grab attention)
WEIGHT: 7
RULE P-002: First 3 seconds rule
CONDITION: First scene of any video
ACTION: The first visual must appear within 0.3 seconds. The first text/graphic/face must
appear within 1.0 seconds. The first hook statement must complete within 3.0 seconds. NO
establishing shots, NO fade-in-from-black, NO logo reveals at the start.
WEIGHT: 10 (hard override for short-form profiles)
RATIONALE: On social media, you have 1-3 seconds before the viewer swipes. The opening
must immediately communicate "this is worth watching." Long intros are for cinema, not
for Reels.
RULE P-003: Platform-specific pacing multiplier
CONDITION: Edit profile specifies a platform
ACTION: Multiply base scene durations by platform factor:
TikTok: 0.7x (fastest pacing)
Instagram Reels: 0.75x
YouTube Shorts: 0.8x
LinkedIn: 1.0x (professional pace)
YouTube Long Form: 1.2x (can breathe more)
E-Learning: 1.3x (comprehension needs time)
Cinematic: 1.5x (slowest, most deliberate)
WEIGHT: 8
11.2 Rhythm Patterns
RULE P-010: Establish a cut rhythm, then break it intentionally
CONDITION: Video has 5+ scenes
ACTION: Establish a consistent cut rhythm for the first 3-4 scenes (e.g., 3s-3s-3s-3s), then
break the pattern at the emotional pivot point (e.g., suddenly hold for 5s or cut rapidly at 1s-
1s-1s). Return to the established rhythm after the pivot.
WEIGHT: 7
RATIONALE: The human brain latches onto patterns. When a pattern breaks, the brain
pays extra attention. This is how professional editors create emphasis without flashy effects
— by controlling time itself.
RULE P-011: Never have 3 consecutive scenes of the same duration
CONDITION: Scene N and scene N-1 have durations within 0.5s of each other
ACTION: Adjust scene N+1 duration to be at least 1.0s different from the pattern
WEIGHT: 5
RATIONALE: Metronomic pacing (tick-tick-tick) feels robotic. Slight variation (tick-tick-
tock) feels human and organic.
11.3 Beat Sync
RULE P-020: Align cuts to BGM beat grid
CONDITION: BGM has a clear beat (detected via FFT analysis) AND edit profile is beat-
aware (TikTok, Reels, YouTube Shorts, Gaming, Montage, Highlight Reel, Music Video)
ACTION: Shift all scene boundaries to the nearest beat. If a cut falls between beats, snap to
the nearest one. Maximum drift allowed: ±2 frames from beat.
WEIGHT: 8
RATIONALE: Cuts that land on beats feel intentional and satisfying. Cuts that land
between beats feel slightly wrong, even if the viewer can't articulate why.
RULE P-021: NOT every cut needs to hit a beat
CONDITION: Beat grid has been calculated
ACTION: 60-80% of cuts should align with beats. 20-40% can fall off-beat intentionally (for
emotional scenes, held moments, or scenes where the music fades).
WEIGHT: 6
RATIONALE: 100% beat-sync feels like a slideshow set to music. The moments that DON'T
hit the beat create organic variation.
PART 12: MONTAGE-SPECIFIC RULES
12.1 Multi-Shot Montage Assembly
RULE M-001: Montage shot duration follows energy arc
CONDITION: Scene is flagged as montage (multiple sub-shots detected by scene parser)
ACTION: Apply energy arc to sub-shot durations:
First 30% of montage: 1.5-2.0s per shot (establishing rhythm)
Middle 40%: 1.0-1.5s per shot (building pace)
Final 30%: 0.7-1.0s per shot (peak energy)
OR reverse for "calming" montages (fast → slow)
WEIGHT: 7
RATIONALE: A montage that starts fast has nowhere to go. Building the pace within the
montage creates a satisfying acceleration curve.
RULE M-002: Montage transition consistency
CONDITION: Scene is montage with 4+ sub-shots
ACTION: Use ONE transition type for all sub-shot boundaries within the montage.
Typically hard-cut. The montage enters and exits with a different transition (dissolve, dip-
to-black) to mark its boundaries with the surrounding scenes.
WEIGHT: 8
RATIONALE: Varying transitions within a montage (dissolve, then cut, then wipe, then
flash) looks chaotic. The uniform transitions make the montage feel like ONE unified
section.
RULE M-003: Montage visual variety requirement
CONDITION: Scene is montage with 4+ sub-shots
ACTION: Ensure no two adjacent sub-shots have the same framing. Alternate between:
Close-up → Wide → Medium → Close-up → Wide
OR: Subject A → Object B → Subject C → Action D
WEIGHT: 7
RATIONALE: Montages work because of visual variety. Two consecutive close-ups feel like
the same shot repeated. Alternating scale and subject keeps the eye engaged.
12.2 Montage Audio Design
RULE M-010: BGM dominance during montage
CONDITION: Scene is montage AND voiceover is minimal or absent during the montage
section
ACTION: AUDIO-DUCK → music-swell, raise BGM to -3dB to 0dB during montage. If
voiceover exists during montage, keep standard ducking but with higher BGM floor (-12dB
instead of -18dB).
WEIGHT: 7
RATIONALE: Montages are driven by music, not narration. The music needs to breathe up
and carry the energy.
PART 13: NARRATIVE ARC RULES
13.1 Structure-Specific Decision Patterns
RULE N-001: AIDA structure pacing
CONDITION: Edit profile narrative mode is AIDA OR script structure follows Attention-
Interest-Desire-Action
ACTION: Apply per-section treatment:
Attention (0-15%): Fast cuts, zoom-punches, flash transition in, high energy. FIRST
FRAME must hook.
Interest (15-45%): Moderate pace, dissolves between evidence/examples, stat-
counters for proof points. Push-in zooms during key claims.
Desire (45-75%): Emotional pace, slow-mo on testimonial/result moments, warm
filter shift, music swells, kinetic typography for powerful statements.
Action (75-100%): Energy ramp-up, zoom-punch to CTA, logo-reveal graphic,
crisp/vibrant filter, strong closing SFX (boom/impact).
WEIGHT: 8
RULE N-002: Problem-Solution structure contrast
CONDITION: Edit profile narrative mode is Problem-Solution OR Before-After
ACTION: Create STARK visual contrast between halves:
Problem half: Cool/desaturated filter, slower pace, tighter framing, subtle handheld
shake, minor-key music, risers building tension
Transition moment: Dip-to-black OR dip-to-white, silence-beat, 0.8-1.0s
Solution half: Warm/vibrant filter, faster pace, wider framing (showing possibility),
stable/smooth, major-key music, resolving SFX
WEIGHT: 8
RATIONALE: The contrast between problem and solution must be FELT, not just heard in
the voiceover. Every visual and audio element should reinforce which "world" we're in.
RULE N-003: 3-Act structure beat points
CONDITION: Edit profile narrative mode is 3-Act Story OR Hero Journey
ACTION: Place emphasis decisions at structural beats:
Inciting incident (10-15%): Flash or zoom-punch transition, camera-shake, SFX hit
Rising action (15-60%): Gradually increasing pace, escalating zoom intensity,
building music
Climax (60-75%): Maximum decision intensity — slow-mo on the peak moment,
biggest graphic, strongest SFX, most aggressive zoom. This is where you "spend" your
budget.
Resolution (75-100%): Rapid de-escalation — wider shots, pull-back zoom, dissolve
transitions, filter warms, music softens
WEIGHT: 7
13.2 The Nostalgia Arc (Specific to Scripts Like "Golden Arches of Memory")
RULE N-010: Memory/nostalgia temporal progression
CONDITION: Script structure moves through time periods (childhood → youth →
adulthood → present)
ACTION: Apply progressive treatment:
Early memories: Vintage-film filter (warm, grain, slightly soft), slow dissolves
between shots, drift-zoom on stills, gentle music, voiceover pacing = slow (0.85x)
Middle years: Filter gradually sharpens and saturates, cut pace increases, transitions
shift from dissolves to cuts, music gains energy
Present day: Crisp/vibrant filter, normal-to-fast cuts, zoom-punches allowed, full-
energy music, clear and direct voiceover
Future/CTA: Brightest filter, cleanest visuals, most confident pacing, resolving music
WEIGHT: 8
RATIONALE: The visual treatment should SHOW the passage of time, not just rely on the
voiceover to tell it. Old memories should LOOK like old memories.
PART 14: PLATFORM-SPECIFIC OVERRIDE RULES
14.1 TikTok / Instagram Reels / YouTube Shorts (Vertical Short-Form)
RULE PL-001: Short-form overrides
CONDITION: Edit profile is TikTok, Instagram Reels, or YouTube Shorts
ACTION: Apply these overrides to ALL other rules:
Maximum scene duration = 4.0s (override base durations)
First hook within 1.0s (stricter than P-002)
Captions MANDATORY (80%+ of viewers watch muted on mobile)
Caption position = center-screen, not bottom (vertical real estate)
Zoom-punch budget increased to 4-5 per 30s (audience expects more energy)
Graphic density increased: 1 keyword per 2.5s allowed
Transitions must be fast: dissolves < 0.5s, wipes < 0.3s
NO dip-to-black longer than 0.5s (kills retention graphs)
BGM must have clear beat for the first 5 seconds
WEIGHT: 9 (platform overrides trump style preferences)
14.2 YouTube Long Form
RULE PL-010: Long-form overrides
CONDITION: Edit profile is YouTube Long Form
ACTION: Apply these overrides:
Scene durations can extend to 6-8s when content warrants it
Captions optional (viewer chose to click, they're invested)
Graphics should be LESS frequent than short-form (1 per 5-6s max)
Transitions can be longer (dissolves up to 1.0s)
Chapter markers at narrative transitions
BGM volume generally lower (more voiceover-focused)
Allow establishing shots and slower openings (but still hook in first 10s)
WEIGHT: 9
14.3 LinkedIn
RULE PL-020: LinkedIn overrides
CONDITION: Edit profile is LinkedIn
ACTION: Apply these overrides:
Captions MANDATORY (autoplay is muted)
Caption style = corporate (clean, professional)
NO aggressive camera shake
NO snap zoom
NO glitch transitions
Maximum 1 zoom-punch per 30s
Graphic style = clean, data-focused (stat-counters, charts, lower-thirds)
Filter = neutral to slightly warm (no heavy color grading)
Pacing = measured, not frantic
Close with professional CTA (lower-third with link, not flashy zoom-punch)
WEIGHT: 9
PART 15: ASSET TYPE DECISION RULES
15.1 Tiered Asset Strategy (Cost Optimization)
RULE AS-001: Asset source decision per shot
CONDITION: Each shot in the storyboard needs an asset source decision
ACTION: Classify each shot and assign source:
AI Video Generation (Kling/Wan/Veo — $0.35/shot): ONLY for hero shots — the
emotional peak, the key product moment, the most important visual in the video. Also
for shots that require specific compositions impossible to find in stock.
Stock Footage (Pixabay/Pexels — $0): For generic establishing shots, common human
activities (walking, talking, eating, driving), cityscapes, nature, abstract b-roll. Search
query derived from scene visual description.
Animated Storyboard (Ken Burns on generated image — $0.012): For quick montage
cuts (< 2s), background/ambient shots, flashback moments where a "photo-like"
quality enhances the nostalgia. Apply drift-zoom (RULE Z-030) mandatory.
Motion Graphics Only (Remotion template — $0): For data-heavy scenes, SaaS
product demos, abstract concepts, "the numbers speak" moments. No video needed,
the graphics ARE the visual.
WEIGHT: 9
RATIONALE: Cost optimization is not about making everything cheap — it's about
spending the budget where it matters most. One stunning AI-generated hero shot is better
than seven mediocre ones.
RULE AS-002: Hero shot identification
CONDITION: Storyboard has been generated, asset source decisions needed
ACTION: Identify hero shots using this criteria (a shot is "hero" if it meets ANY 2 of these):
Contains the decisive emotional moment of the video
Features the product/brand in a specific required composition
Is the first shot of the video (the hook)
Is the final shot of the video (the lasting impression)
Requires a specific human action or interaction that stock can't provide
Is referenced by the voiceover with specific visual language ("watch as...", "imagine...")
Maximum hero shots: 30-40% of total shots. A 7-scene video should have 2-3 hero shots,
NOT 7.
WEIGHT: 8
15.2 AI Video Quality Checks
RULE AS-010: AI video quality gates
CONDITION: AI-generated video returned from generation pipeline
ACTION: Apply quality checks before acceptance:
Subject consistency: Does the main subject match the storyboard? (> 70% visual
similarity required)
Motion quality: Is motion smooth and natural? (reject if subject morphs, limbs
multiply, or objects phase through each other)
Composition match: Does framing match the camera direction specified? (close-up
should be close-up, not wide)
Text artifacts: Is there any garbled text in the frame? (AI video frequently generates
nonsense text on signs, shirts, etc. — this is a reject condition)
If a video fails quality checks, retry once with adjusted prompt. If second attempt fails, fall
back to animated storyboard + RULE Z-030.
WEIGHT: 9
PART 16: EMOTIONAL INTELLIGENCE RULES
16.1 Mood Detection and Response
RULE E-001: Mood-to-decision mapping
CONDITION: Scene mood has been classified from script parsing
ACTION: Apply mood-appropriate decision defaults BEFORE any other rules:
Mood
Default
Zoom
Default
Transition
Default Shake
Default
Filter
Default SFX
Density
Happy/Playful
Push-in,
moderate
Hard-cut, fast
None
Warm-
vibrant
Medium
Sad/Reflective
Slow push or
drift
Dissolve
None
Cool-desat
Low
Energetic/Exciting
Punch-in,
snap
Zoom-punch,
flash
Impact
High-
contrast
High
Tense/Dramatic
Slow push,
tight
Hard-cut, dip-
to-black
Subtle
handheld
Dark-cinema
Low-medium
Nostalgic/Warm
Drift zoom
Dissolve, film-
burn
None
Vintage-film
Low
Professional/Clean
Minimal
push
Hard-cut,
dissolve
None
Minimal-
grade
Very low
Comedic/Playful
Snap zoom
Flash, swish-
pan
Impact on
punchlines
Warm-
vibrant
Medium-
high
Mysterious/Dark
Pull-back
Dip-to-black,
blur
Subtle
Noir
Low
Aspirational/Dreamy
Slow push
Light-leak,
dissolve
None
Soft-glow
Low
Angry/Aggressive
Punch-in,
shake
Flash, glitch
Aggressive
High-
contrast,
desat
High
WEIGHT: 6 (defaults that other rules can override)
16.2 Emotional Escalation Tracking
RULE E-010: Track emotional intensity across timeline
CONDITION: Project has 3+ scenes
ACTION: Assign each scene an emotional intensity score (0.0 to 1.0) based on voiceover
energy, script content, and mood classification. Track the running average. The Unified
Intelligence Engine should:
Identify the PEAK intensity moment (the climax)
Ensure decisions BEFORE the peak are less intense than the peak itself
Ensure decisions AFTER the peak de-escalate (unless the video ends on a high)
Flag any sequence where intensity plateaus for more than 3 consecutive scenes (this
means the video is flat and needs variation)
WEIGHT: 8
RATIONALE: Emotional dynamics are what make a video feel like a STORY rather than a
list of clips. Even a 30-second video needs an emotional arc — it can't be 30 seconds of the
same intensity level.
PART 17: ANTI-PATTERNS — WHAT THE DIRECTOR AGENT MUST NEVER DO
17.1 Hard Prohibitions
ID
Anti-Pattern
Why It's Bad
Alternative
AP-
001
Zoom-punch on every cut
Looks like a broken zoom tool,
not editing
Use zoom-punch max 3x per 30s,
hard-cut for the rest
AP-
002
Camera shake throughout
entire video
Nauseating, unprofessional,
unwatchable
Use shake on specific impact
moments only
AP-
003
Every word in captions
highlighted
Nothing is emphasized =
nothing matters
Max 1 emphasis per sentence
AP-
004
Dissolve between high-
energy scenes
Dissolves drain energy, creates
mismatch
Hard-cut or zoom-punch for
energy
AP-
005
Dip-to-black in fast
montage
Kills all momentum, montage
dead on arrival
Hard-cut only within montages
AP-
006
Graphics overlapping
captions
Unreadable, unprofessional
Respect RULE G-100 screen
zones
AP-
007
SFX on every single cut
Viewer hears "whoosh-
whoosh-whoosh" constantly
SFX on 40-60% of transitions,
subtle volume
AP-
008
Same zoom level entire
video
Feels like watching through a
security camera
Vary between push, pull, punch,
drift
ID
Anti-Pattern
Why It's Bad
Alternative
AP-
009
Filter changes every scene
Looks like a filter demo reel
Max 2 filters per 60s video
AP-
010
Opening with logo reveal
Nobody cares about your logo
until they're hooked
Logo at END, hook at START
AP-
011
Same scene duration
throughout
Metronomic, robotic, boring
Vary durations, break patterns
AP-
012
Slow-mo on AI video
below 0.5x
Artifacts become obvious,
motion breaks
Clamp AI slow-mo to 0.5x
minimum
AP-
013
Graphic appearing during
transition
Viewer can't focus, elements
compete
Graphics on stable frames only
AP-
014
Speed ramp with no audio
support
Feels random and
disconnected
Always pair speed changes with
SFX or music sync
AP-
015
More than 3 graphic types
simultaneously
Visual overload, design chaos
Max 2 overlays (excluding
captions)
AP-
016
Aggressive filter on
brand/product shots
Distorts brand colors, client
rejection
Neutral/minimal filter on
product close-ups
AP-
017
Kinetic typography over
complex visuals
Text competes with visual,
both lose
Kinetic text only over
simple/abstract backgrounds
AP-
018
Beat-sync at 100%
alignment
Feels like a slideshow set to
music
60-80% beat alignment, 20-40%
organic
AP-
019
Handheld shake + zoom-
punch combo
Double motion = nausea
One or the other, never both
AP-
020
Rising energy with no
payoff
Riser → nothing feels like a
broken promise
Every riser must lead to a reward
(reveal, impact, drop)
PART 18: DECISION CONFLICT RESOLUTION
18.1 When Rules Conflict
When two or more rules suggest conflicting decisions for the same moment, resolve using this
priority chain:
1. Hard overrides (WEIGHT: 10) always win. These are safety rules, anti-patterns, and
budgets.
2. Murch hierarchy — if still conflicting, the decision that serves the higher Murch criterion
(Emotion > Story > Rhythm > Eye-trace > 2D > 3D) wins.
3. Platform overrides (WEIGHT: 9) trump style preferences.
4. Specificity — a rule that applies to this EXACT situation beats a generic rule. RULE T-050
(film-burn for nostalgia) beats RULE T-001 (default hard-cut) when the scene IS nostalgic.
5. Emotional arc — if still tied, choose the decision that better serves the emotional escalation
curve (RULE E-010).
18.2 Decision Logging
Every EDL decision must include:
PART 19: IMPLEMENTATION CHECKLIST FOR CLAUDE CODE
19.1 Integration Points
This knowledge base should be integrated into Editron at these specific points:
1. Unified Intelligence Engine prompt — Encode the rule IDs and conditions as a structured
reference that Gemini 2.5 Flash receives alongside the project context. The AI should CITE
rule IDs in its decisions.


json
{
"type": "ZOOM",
"subtype": "punch-in",
"timestamp_ms": 4230,
"duration_ms": 200,
"parameters": { "scale": 1.12, "easing": "elasticOut" },
"rules_applied": ["Z-010", "Z-011"],
"rules_rejected": ["Z-031"],
"conflict_resolution": "Z-010 triggered (voiceover emphasis detected at 4230ms), Z
"murch_justification": "Emotion: reinforces the impact of the key statistic. Story
"confidence": 0.85
}
2. EDL Executor — The executor must validate every decision against the anti-patterns (Part
17) and budgets (G-002, G-101, G-102, CS-020, A-100, Z-011, C-012, F-011) BEFORE
applying. Reject decisions that violate hard overrides.
3. Director Agent Step 6 (Pacing Adjustments) — Integrate Part 11 (Pacing Rules) and Part 13
(Narrative Arc Rules) into the pacing pass.
4. Director Agent Step 7 (Transitions) — Use Part 3 (Cut and Transition Rules) as the
decision framework.
5. Director Agent Step 9 (Auto-Captions) — Use Part 8 (Caption Rules) for styling decisions.
6. Director Agent Step 10 (Motion Graphics) — Use Part 7 (Graphics Rules) for placement
and density management.
7. Director Agent Step 12 (Quality Review) — Score the project against anti-patterns. Each
anti-pattern violation is -5 points. Each unfollowed mood-mapping is -2 points.
8. Asset Source Selection (new step, before storyboard generation) — Use Part 15 (Asset
Type Rules) to classify each shot as AI-gen, stock, animated-still, or graphics-only.
19.2 Data Structures Needed
typescript
19.3 Priority Implementation Order
1. FIRST: Budget enforcement (Parts 4.2, 6.3, 7.6, 8.2, 9.5, 10.2) — Prevents the most common
AI over-editing mistakes immediately
2. SECOND: Mood-to-decision mapping (Part 16.1) — Gives every scene sensible defaults
3. THIRD: Transition rules (Part 3) — Transitions are the most visible decisions
4. FOURTH: Zoom rules (Part 4) — Most impactful visual enhancement


// Rule enforcement tracking
interface DecisionBudget {
  zoomPunchCount: number;
// max 3 per 30s (Z-011)
  cameraShakeCount: number;
// max 4 per 30s (CS-020)
  impactShakeCount: number;
// max 2 per 30s (CS-020)
  sfxCount: number;
// max 15 per 30s (A-100)
  prominentSfxCount: number;
// max 5 per 30s (A-100)
  graphicCount: number;
// max 10 per 30s (G-002)
  captionEmphasisCount: number; // max 10 per 30s (C-012)
  filterPresetCount: number;
// max 2 per 60s (F-011)
  flashyTransitionCount: number; // track for T-033
  previousDecisionIntensity: number; // 0.0-1.0 for contrast tracking
  activeOverlayCount: number;
// max 2 simultaneous (G-101)
}
// Scene emotional analysis
interface SceneEmotionalProfile {
  mood: string;
  intensityScore: number;
// 0.0-1.0
  isDecisiveMoment: boolean;
  narrativePosition: 'hook' | 'rising' | 'climax' | 'falling' | 'resolution';
  contentType: 'talking-head' | 'b-roll' | 'montage' | 'product' | 'data' | 'emotion
  assetRecommendation: 'ai-video' | 'stock' | 'animated-still' | 'graphics-only';
}
// Conflict resolution log
interface ConflictResolution {
  decisionPoint: string;
  competingRules: string[];
  winner: string;
  reason: string;
  murchCriterion: 'emotion' | 'story' | 'rhythm' | 'eye-trace' | '2d-plane' | '3d-co
}
5. FIFTH: Graphics placement (Part 7) — The differentiator for modern short-form
6. SIXTH: Audio/SFX rules (Part 9) — Often overlooked but critical for professional feel
7. SEVENTH: Narrative arc rules (Part 13) — Makes the video feel like a STORY
8. EIGHTH: Platform overrides (Part 14) — Optimization for distribution
9. NINTH: Asset strategy (Part 15) — Cost optimization
10. TENTH: Pacing/rhythm rules (Part 11) — Fine-tuning
APPENDIX A: RECOMMENDED STUDY SOURCES
For deepening the knowledge base beyond these rules:
Source
What It Teaches
How to Encode
Walter Murch — "In the Blink of
an Eye"
Cut timing, emotional editing, the 6
criteria
Already encoded in Part 1
Daniel Arijon — "Grammar of
the Film Language"
Shot composition, camera angles,
visual narrative grammar
Extend Part 4 with shot-
type rules
Sidney Lumet — "Making
Movies"
Director's decision process, actor-
camera relationships
Extend Part 13 narrative
rules
David Bordwell — "Film Art: An
Introduction"
Formal analysis of all film techniques
Academic framework for
new rule categories
Tony Zhou — "Every Frame a
Painting" (YouTube)
Modern practical editing analysis
Short-form specific rules,
extend Part 14
Sven Pape — "This Guy Edits"
(YouTube)
Professional editor workflow, real
project decisions
Practical anti-patterns,
extend Part 17
Casey Neistat vlogs
Vlog editing grammar, pacing for
YouTube
Platform-specific rules for
YouTube
Hayao Miyazaki — any film,
scene-by-scene
Master-class in emotional pacing, the
power of held moments
Rules about when NOT to
cut
Edgar Wright — any film, scene-
by-scene
Master-class in rhythmic editing, beat-
sync, transition as comedy
Extend Part 11 rhythm rules
Vox / Johnny Harris video
essays
Modern explainer editing, data
visualization in video
Extend Part 7 graphics rules
APPENDIX B: RULE INDEX
Total rules in this knowledge base: 120+
Part
Category
Rule Range
Count
3
Transitions
T-001 to T-051
17
4
Zoom/Camera
Z-001 to Z-040
12
5
Speed Changes
S-001 to S-021
7
6
Camera Shake
CS-001 to CS-020
5
7
Graphics
G-001 to G-102
15
8
Captions
C-001 to C-020
6
9
Audio/SFX
A-001 to A-100
11
10
Filters
F-001 to F-011
5
11
Pacing
P-001 to P-021
7
12
Montage
M-001 to M-010
4
13
Narrative Arc
N-001 to N-010
4
14
Platform
PL-001 to PL-020
3
15
Asset Strategy
AS-001 to AS-010
3
16
Emotional Intelligence
E-001 to E-010
2
17
Anti-Patterns
AP-001 to AP-020
20
This document is the Director Agent's brain. Every decision it makes should trace back to a rule in
this knowledge base. If a situation arises that no rule covers, document the decision and the
reasoning — it becomes a candidate for a new rule.
