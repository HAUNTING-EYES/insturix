# Adversarial Audit v2 — Full System
**Date:** 2026-03-26
**Status:** DOCUMENTED

## CRITICAL (5)
1. A1: Credit deduction race condition in storyboard generate loop
2. A2: GCS signed URLs expire after 7 days, no proactive refresh
3. A3: Browser autosave clobbers worker-added BGM/SFX overlays
4. A4: Edit directions fail silently, user doesn't know
5. A5: Overlay ID collision between concurrent workers

## HIGH (8)
1. B1: Voiceover credits deducted before TTS, no refund on failure
2. B2: QStash worker signature disabled in dev mode
3. B3: Voiceover truncation warning not surfaced to user
4. B4: Asset resolver fallback to expired URLs
5. B5: Chat rate limit bypass via multiple projectIds
6. C7: No userId validation in audio workers
7. E1: Concurrent video generation produces blank scenes
8. E2: Project autosave races with Director Agent

## MEDIUM (10)
- C1: 5-Track analysis disabled by default on failure
- C2: Caption font doesn't scale with box resize
- C3: Director skips 5-track silently
- C4: GCS path not stored for voiceover assets
- C5: Duration estimate cap is arbitrary
- C6: No profile validation before Director
- C8: Transcript timing drift on long scenes
- D1: No auth check in asset resolver
- D2: Missing project access audit logging
- D3: AWS credentials in plaintext .env

## FIX PRIORITY
1. A1 + A5: Atomic credits + unique IDs
2. A3: Autosave preserves worker overlays
3. A4: Edit direction failures visible
4. A2: GCS URL expiry 30 days + refresh
5. B1: Credits post-TTS not pre-TTS
6. E2: Lock project during Director execution
