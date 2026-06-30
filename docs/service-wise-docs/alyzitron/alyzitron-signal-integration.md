# Alyzitron Brand Vault Lens Contract

Status: superseded plan replaced on 2026-07-01.

This document intentionally replaces the older "Alyzitron writes signals into
Brand Vault" plan. That direction is no longer correct.

## Hard Boundary

Alyzitron must never mutate Brand Vault.

Brand Vault is the read-only brand memory and evidence source. Alyzitron is the
analysis surface that uses that memory as a lens for one analysis task.

Allowed:

- Read the active/accepted Brand Vault profile for the selected brand.
- Read legacy brand registry data as a fallback when the accepted profile is not
  available.
- Store the analysis task's selected `brandId`, lens source, content intent, and
  generated report in Alyzitron-owned task records.
- Emit generic service lifecycle events, such as "analysis_complete", that do
  not alter Brand Vault evidence or accepted profile data.

Forbidden:

- Do not create a Brand Vault signal decoder for Alyzitron.
- Do not write, upsert, stage, accept, or aggregate Brand Vault evidence from
  Alyzitron analysis output.
- Do not add `signalCandidates` for the purpose of updating Brand Vault.
- Do not create `lib/alyzitron/services/brand-vault-integration.ts` as a writer.
- Do not treat competitor or reference analysis as a source of permanent brand
  learning.

## Correct Control Flow

```text
Selected active brand
  -> Brand Vault accepted profile read
  -> Alyzitron prompt lens
  -> Multimodal analysis
  -> Alyzitron report, chat, and optional Editron quality sync
```

Brand Vault remains the source of brand truth. Alyzitron can say "this content is
on brand", "this content is off brand", or "this competitor pattern can be
adapted", but those statements stay inside the Alyzitron analysis result unless a
future user-reviewed workflow explicitly promotes them somewhere else.

## Current Code Anchors

- `lib/alyzitron/services/brand-vault-context.ts` already resolves the brand
  context by reading accepted Brand Vault profile data and legacy brand data.
- `app/api/services/alyzitron/analyze/route.ts` already accepts `brandId` and
  stores brand lens metadata when it is present.
- `app/api/services/alyzitron/processor/route.ts` already rebuilds the brand
  lens before calling `analyzeVideoWithGemini`.
- `lib/services/vertexAiService.ts` already has a brand alignment prompt block
  when `brandContextBlock` is present.

The missing production work is not a write-back decoder. The missing work is a
better lens contract, active-brand UX wiring, ownership-intent detection,
intent-aware prompt/schema output, report sections, and chat awareness.

## Source Naming

The previous plan used `sourceType: "self | competitor | reference"`. That name
is ambiguous because current Alyzitron UI/debug code also uses source type for
media transport, such as file or link.

Use these names instead:

- `mediaSourceKind`: file, youtube_url, external_url, r2, gcs, image.
- `contentIntent`: own_content, competitor_content, reference_content, unknown.

`mediaSourceKind` explains how the media entered Alyzitron. `contentIntent`
explains how the user wants the media analyzed.

## Authoritative Spec

The implementation spec is:

`docs/service-wise-docs/alyzitron/brand-vault-lens-intent-spec.md`
