# HREF-01 native-video review pack

Date: 2026-08-22
Status: `QUALIFIED_SINGLE_PROJECT_OWNER_REVIEW_COMPLETE`
Formal promotion status: `BLOCKED_PENDING_SECOND_INDEPENDENT_QUALIFIED_REVIEWER`

## What executed

Gemini 3.6 completed one provider-native video-and-audio observation episode
against the exact 64.75-second HREF-01 reference. The episode used one model
call, selected no editing operator, changed no project state and terminated
`READY_FOR_EVALUATION`.

- Source: `public/product_demos/showcase/insturix-final-intro.mp4`
- Source SHA-256:
  `d95dd77fccaa5e6eb4f1c0e42b399b95a801937c49ef072160d10b2a4208e73f`
- Episode root:
  `.calibration-temp/open-ended-planner-v2/provider-native-href01-native-g36-20260820175716`
- Episode receipt SHA-256:
  `010949ce8138f1ec628a22eadcd7c9aacc8a6019e3e3589a435397aa1063eb50`
- Run receipt SHA-256:
  `eecf80deaf51c89f88be398efcf81f30bc6a360ca153607228747cc527690b00`

Gemini 3.7 attempts ended in provider HTTP 500/high-demand failures. Those
attempts are infrastructure failures, not semantic model failures, and are not
substituted into this review pack.

## Blinded review evidence

The reproducible pack builder copied the exact full reference and materialized
the model-requested dense window at 60/1 fps with embedded audio and a separate
96 kHz stereo PCM WAV.

- Review root:
  `.calibration-temp/open-ended-planner-v2/provider-native-href01-review-pack-20260822`
- Public pack hash:
  `4431c08ba4f3731718f350723137699dd57cca810e0c80c0f5c95b922fbe93ba`
- Reviewer manifest SHA-256:
  `bd467795665533e28194e4a869b8036dea5c292d53dcc82c4c4f67bf2ad0561a`
- Review-form template SHA-256:
  `f5bbf6b142da28649d06ba20e9500bb8bda7745b8b3d6251bf27364bd5971e2f`
- Dense window: `[20.000s, 23.000s)`, 180 expected and decoded frames
- Dense video SHA-256:
  `5624ff5403cca41fdc643603aa13b358cbe893c87f6d8c90d0e4713fe7b4073d`
- Dense audio SHA-256:
  `7503f65b9a30f09933b34f7bb646207718dabecfeda01eb040ebb4a833b16488`

The reviewer manifest withholds provider/model identity. The operator key is
separate and must remain closed until the review form is final.

## Qualified sole-review completion

The project owner watched the complete reference with sound, inspected the
dense video and WAV, and completed every required decision in the frozen form.
All nine requirements were marked `PASS`; no hard failure was observed and the
correction estimate was zero minutes.

- Completed-form SHA-bound receipt:
  `f699348094d84079765115556b9b9746ef6a51eccdc79ff7fddecf49ee992d88`
- Reviewer disposition: `QUALIFIED_SINGLE_PROJECT_OWNER_REVIEW`
- Independent agreement: `UNVERIFIABLE_SINGLE_REVIEWER`
- State effects: none

This is useful qualified evidence for the observed reference-analysis result.
It is not two-reviewer agreement, model promotion, paid-dispatch authority or
product-execution authority. Formal promotion remains blocked until a second
independent qualified reviewer completes the same blinded pack, or the
governance contract is explicitly revised before identities are revealed.

## Verification

- HREF-01 focused suite: 20/20 tests passed.
- The dedicated qualified-review finalizer independently verifies the form,
  media, pack and receipt bindings; its focused suite passed 12/12.
- The pack builder rejects forged receipts, invalid/over-budget dense windows
  and overwrite attempts.
- The copied reference hash matches the frozen source.
- FFmpeg decoded exactly 180 frames from the dense video.
- No project mutation, timeline authority, generated-composition insertion or
  production planner permission was introduced.
