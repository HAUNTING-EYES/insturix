---
name: feedback-no-profile-default
description: "NEVER default to profile-based logic. Signals first. Profiles are user-facing labels, not system architecture. See [[project_mode2_signal_architecture]]."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b0f0681b-c901-4f84-966f-f720f49025bb
---

Never default to profile-based approaches for system logic. Profiles are user-facing labels for bundled presets — they are NOT the source of truth for system behavior.

**Why:** Mode 2 architecture is signal-driven, not profile-driven. The agent kept falling back to "map profileId to behavior" or "graphicsDensity from profile determines X." This creates brittle static mappings (54 profiles, each hand-categorized) instead of dynamic behavior driven by content signals.

**How to apply:** When designing any system behavior (graphic density, pacing, transitions, SFX density, caption style), ask: "Can this be computed from signals instead of looked up from a profile?" If yes, use signals. Only fall back to profile fields when there is no signal available AND the user needs a manual override.

Signal-driven: `graphic_count = f(pacing_velocity, formality, entity_rate, visual_dependency)`
Profile-driven: `if profile.graphicsDensity === 'moderate' then 5 per 30s` ← AVOID THIS

Related: [[project_mode2_signal_architecture]], [[insturix_vision]]
