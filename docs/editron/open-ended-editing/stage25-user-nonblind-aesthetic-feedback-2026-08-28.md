# Stage 2.5 programme-owner RHC feedback — 2026-08-28

## Evidence classification

```text
disposition: USER_NON_BLIND_AESTHETIC_FEEDBACK
reviewer: Editron programme owner
formalBlindReceipt: NO
qualifiedProfessionalEditorReceipt: NO
stage25DecisionEffect: NONE_DIRECT
```

This is valid founder/product feedback and must drive corrections. It is not
converted into the frozen blind-review contract because route implementation
details had already been discussed in chat. No missing answer is inferred as a
pass.

The reviewed packet was
`stage25-human-quality-6071c0857-v1`, packet hash
`a9a2a109d75921d62aa9ab6ef0b09c7b6b995026488999cbe646ccae80155df1`.
The packet is preserved unchanged.

## RHC-01 — feature board

Programme-owner preference:

```text
C > B > A
```

The filenames confirm that candidate A is the first shown item, B the second
and C the third; this record does not open or disclose the sealed route key.

Observed findings:

- Candidate A did not visibly hold all three labelled sources together before
  release. This is a reported failure of `RHC01-T2`, not merely a style dislike.
- Candidate A had weaker motion and layout.
- B and C revealed their text more slowly, making it more readable, and their
  spacing appeared more even.
- The question about whether the final source “continues naturally” was not
  understandable from the packet. All three ended on similar pink-toned source
  imagery, but the reviewer could not identify the intended source-frame
  continuity proof from the visual alone. `RHC01-T3` is therefore not promoted
  by this review.

Disposition: candidate A needs correction; C is the current aesthetic
preference, then B. No delivery-ready verdict is inferred for C or B because
the continuity question remained unclear.

## RHC-02 — interview chapter moment

Observed findings:

- Only one candidate was present. That matches the V1 packet: only the
  technically qualified hybrid result was rendered; this was not a three-route
  comparison.
- Both supplied stills appeared.
- The spoken sentence completed and remained intelligible.
- No obvious audio break was reported, but the reviewer did not know what “room
  tone” meant, so this is not a human pass for `RHC02-P2`.
- The return looked like a simple hard cut rather than a blended transition.
  A hard cut is not automatically wrong, but the packet did not make the
  intended continuity criterion clear.
- The reviewer correctly observed that there was no moving interview image.

Source reconciliation confirms the last point. The V1 fixture is a static
repository portrait loop with a voiceover and synthetic pink-noise ambience.
It is technically an audiovisual interview surrogate, not a realistic moving
interview. Therefore it can prove exact frame/audio handoff mechanics, but it
cannot support a professional aesthetic claim about returning to live interview
motion.

“Room tone” means the quiet background ambience of the recording space—air
conditioning, distant room sound and microphone noise—under the voice. A good
edit should not suddenly become silent or change ambience at the chapter
boundaries. In this fixture the room tone is synthetic pink noise, while the
technical receipt separately proves that its decoded samples did not change.

Disposition: technical handoff proof remains valid for the synthetic fixture;
human editorial acceptance is unverified. A successor quality candidate needs
rights-cleared moving interview footage or must be honestly renamed as a
voiceover portrait task.

## RHC-03 — synchronized split view

Observed findings:

- Only one candidate was present, matching the one technically qualified
  hybrid result in the V1 packet.
- Both views appeared to be on the same action phase.
- `SYNC` was readable.
- The reviewer could not verify the authored-wide return frame or unchanged
  synchronized production audio from the packet alone.
- The centered black label strip visibly covered the inward portions of both
  subjects in the supplied screenshot.

The screenshot inspected in this review was 57,187 bytes with SHA-256
`54e0e466be663414122472f6fdca89316d75eb741c5a8a4b8406e6099a6ffefd`.
It shows the vertical `SYNC` strip over subject content. That conflicts with the
public requirement that the label cover neither subject. The earlier technical
measurement used conservative subject boxes that did not capture this visible
occlusion; passing those boxes is not enough to override the human observation.

Disposition: `RHC03-T2` needs correction and stronger subject-mask/clearance
evidence before blind review. The candidate is not aesthetically accepted.

## RHC-04 — results card and correction

Observed findings:

- Only one initial/corrected pair was present, as designed; this task measures
  correction locality, not route preference.
- The final state visibly ended on `10%`.
- The reviewer could not verify whether `60`, `30`/`35` and `10` were paired
  with the correct source closeups because the packet did not include the source
  reference images or a neutral pairing board.
- The corrected middle image differed from the initial middle image.

The image change is mechanically expected by the frozen correction instruction:
change one number, **its paired source**, and the final hold length while
preserving everything else. The intended change was therefore `30% -> 35%`,
the middle source binding, and the final hold—not the number alone. The packet
failed to make those three requested changes easy for the reviewer to see.

Disposition: exact unchanged-state technical proof remains valid, but human
pairing correctness is unverified from the V1 packet. A successor packet must
include neutral, route-blind source thumbnails and an explicit initial/corrected
pairing reference. A separate live hands-on correction session is still needed;
watching a prebuilt correction cannot supply correction time.

## Review-packet defects exposed by this feedback

The V1 packet is preserved as historical evidence, but it is not sufficient for
the next formal promotion review:

1. RHC-01's continuity question needs a marked source/reference explanation.
2. RHC-02's static portrait cannot test a natural live-motion interview return.
3. RHC-02 must define room tone in ordinary language.
4. RHC-03 needs a corrected non-occluding label treatment and stronger tracked
   subject clearance evidence.
5. RHC-03 needs an authored-wide action reference for human return judgment.
6. RHC-04 needs source thumbnails and initial/corrected pairing references.
7. The packet must say plainly that RHC-01 is a three-candidate comparison,
   RHC-02/RHC-03 are single-candidate acceptance reviews, and RHC-04 is an
   initial-versus-corrected locality review.

Do not submit V1 to a new reviewer and call the resulting omissions a fair blind
quality verdict. Freeze a V2 packet with a new identity after the RHC-02 and
RHC-03 candidate corrections and the missing reference media are supplied.

## Effect on Stage 2.5

This feedback does not rewrite the frozen `MODIFY` receipt. It strengthens the
reason for `MODIFY`: technical synchronization and preservation can pass while
the visual result or the review instrument still fails. The successor `GO` gate
requires corrected candidates, a fair V2 packet, qualified blind reviews and
the measured RHC-04 correction session.
