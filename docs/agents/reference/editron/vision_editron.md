---
name: Editron Product Vision
description: Nimit's full vision for Editron — what it is, what it does, how it should work
type: feedback
---

# Editron Vision — Save This

## What Editron IS
Adobe-level video editor with AI chat. Mac of video editing, not Linux — powerful but not overwhelming.

## Three Modes

### 1. Script → AI Video (current priority)
- Script from ThinkForge or user upload
- System understands script → generates reference images → makes storyboard (so user sees the flow)
- From ALL context (script, storyboard, references, user profile, video type):
  - Generates AI videos for each scene
  - Lays over BGM, SFX (AI gen + stock), voiceover, transitions, keyframes, VFX, animations, motion graphics, text — whatever is needed
  - Video is made
- For montages/trendy edits with many clips: stock videos for small clips, Ken Burns as ABSOLUTE LAST RESORT
- Full AI videos can be 3-5 minutes, scene chaining for continuity in long scenes
- Can handle ANY script type — not just montage ads

### 2. Pre-shot (Post-Production Only)
- User uploads their own footage (link or mp4)
- AI does ONLY post-production: editing, motion graphics, VFX, SFX, BGM, transitions, etc.
- System understands the uploaded video (style, content, pacing)
- Applies editing decisions accordingly

### 3. Hybrid
- Some shots from camera, some impossible/missing shots filled by AI
- AI fills gaps context-aware (matching quality, design language, style of real footage)
- Then post-production on everything

## Future Capabilities
- Style learning from reference videos (upload a link, system learns the editing style)
- Music-UNDERSTANDING editing — not just beat sync but actually understanding the music and editing accordingly
- Learning new editing styles, trends, caption types, masking techniques
- Knowledge graph DB storing everything the system learns
- AI avatars
- DaVinci-level tool availability, Mac-level UX

## Critical Rules (from Nimit)
- Ken Burns (animated stills) is ABSOLUTE LAST RESORT — never the default strategy
- Script duration is KING — if script says 4s, show 4s of the AI clip, don't stretch to 10s
- Never base code on one script type — must work for everything
- Stock video is the go-to for small clips, not AI generation for every sub-shot
- The system should understand and adapt, not just follow hardcoded rules
