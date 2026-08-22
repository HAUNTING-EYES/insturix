# Editron Stage 2.5 route-ablation paid results — 2026-08-22

## Disposition

`VALID_BOUNDED_ROUTING_EVIDENCE / MODIFY_AND_PROCEED_RESEARCH`

This result is not production model certification, an execution comparison, a
render-quality result, or permission to mutate a real project. It tests one
question only: given identical DEV-02 target and current capability truth, can
the model distinguish the architecturally appropriate route from what is
currently executable, including an honest capability gap?

## Frozen identities

- Harness commit: `567414438`
- No-provider qualification commit: `4d79e0986`
- Provider-preflight commit: `18ac28f9b`
- Provider manifest:
  `fe74474472d3a74e46f8a58fc0b9f4a2c937f0761f69d087a057f88f64ae45f7`
- Hidden evaluator policy:
  `6e6e45864c0d2590cac24b8aa972de085c531ecae4b92cd5886aacd4fc552743`
- Zero-inference preflight receipt:
  `0f2e02ce4e998bbff251e881d03993af006211eb5a0a5f622e2ed05b225d1775`
- Request-capture set:
  `44ba549ecdc90538fcb8bc038162d249cacfcd7a8c888c6d0d2e033364376a8d`
- Paid cohort receipt:
  `9583de5c0eb3281ea780e82cca4d0b735c1ec36f41970d6d7d3bfbe5031a498f`
- Sanitized local evidence root:
  `.calibration-temp/editron-stage25-route-ablation-v1/preflight-fe744744-vercel/`

The temporary Vercel production environment export was deleted immediately
after the cohort and its absence was verified. Row receipts persist no secrets,
project reads, project mutations or state effects.

## Cohort

The 24 rows are two scopes (the bounded filmstrip island and full requested
section) by four arms (free choice, forced native, forced generated composition
and forced hybrid) by three routes (GPT-5.6 Luna, GPT-5.6 Terra and Gemini 3.7
Flash).

Within a scope, all arms bind the same Stage-1 packet, target material,
operator catalog, capability dossier and planner-ownership policy. Only the
declared route arm changes. The free-choice gold is evaluator-only. Provider
instructions explicitly say that a forced arm may report a capability gap and
that `RESEARCH_ONLY_NOT_IMPLEMENTED` is never currently eligible.

## Executed result

| Result | Count |
| --- | ---: |
| Rows completed | 24 |
| Provider inference calls | 24 |
| Accepted provider artifacts | 16 |
| Provider rate limits | 8 |
| Hidden `HONEST_CAPABILITY_GAP` | 7 |
| Hidden `FAIL` | 9 |
| Hidden `UNVERIFIABLE` | 8 |
| Google repair token-count calls | 0 |
| Known provider cost | `$1.5474777` |
| Project reads / mutations / state effects | `0 / 0 / 0` |

Provider breakdown:

| Provider | Honest gaps | Fails | Unverifiable |
| --- | ---: | ---: | ---: |
| Luna | 3 | 5 | 0 |
| Terra | 4 | 4 | 0 |
| Gemini 3.7 Flash | 0 | 0 | 8 |

Gemini returned HTTP 429 on all eight inference calls. Those rows are
infrastructure non-evaluations, not model failures. No provider leaderboard is
supported.

## Accepted artifacts that failed hidden evaluation

The nine failures were not low-level port or compiler-topology failures. The
models generally identified the intended architecture and covered the target
claims, but their final execution disposition contradicted their own current-
capability analysis:

- bounded free choice: Luna and Terra chose the generated-island architecture
  while declaring `generated_composition_program` ineligible and selecting no
  executable generated owner;
- full-section free choice: Luna and Terra chose the hybrid architecture while
  selecting neither an executable generated island nor executable native
  boundary owner;
- forced hybrid: both models labelled the result hybrid while the graph
  contained only gap nodes for one or both required sides;
- bounded forced generated: Luna labelled the result generated while its only
  generated node had `selectedOperatorId: null` and `CAPABILITY_GAP`;
- one Luna full-section hybrid artifact supplied inputs to a gap node, which
  the selected-operator contract forbids.

The correct current answer may say that generated or hybrid is the desired
architecture, but its executable result must be `CAPABILITY_GAP`. Terra did so
in four rows and Luna in three. Both correctly rejected forced native for both
scopes. This supports separating architectural route intent from present
execution disposition; it does not support production autonomy.

## Fairness and limitations

The result is usable for its bounded claim because the arm did not change
target, evidence, catalog or capability truth; evaluator gold was absent from
provider input; the contract explicitly allowed an honest gap; models selected
semantic operator IDs rather than runtime ports; and no compiler, project
mutation, generated sandbox or rendered output was involved.

It remains limited to one task family and one trial per provider/row. All
relevant creative alternatives are currently uncertified or unavailable, so
this cohort cannot compare their rendered quality. Gemini is unevaluated due
to rate limits. Target-claim reconstruction was supplied from the frozen
DEV-02 blueprint, and no blind editor scored these planning artifacts.

## Required next order

1. Do not spend again on identical Luna/Terra Stage-2 rows. Retry Gemini only
   under a new supplemental identity after the route is demonstrably callable.
2. Define truthful executable native, generated and hybrid proxy alternatives
   without promoting unavailable owners. If a route cannot execute, retain a
   structured gap rather than constructing a fake substitute.
3. Compare only actually executable alternatives using rendered fidelity,
   editability, repair count, correction time, latency, cost and preservation.
4. Expand the episode benchmark to other dependency/invalidation shapes,
   stale/overlap/rebase/lock behavior, compaction/resume and long-form planning.
5. Finish HREF-01's sole-reviewer receipt and dense audiovisual observation,
   while leaving independent agreement `UNVERIFIABLE` until a real second
   qualified reviewer exists.
6. Freeze `GO`, `MODIFY` or `NO-GO` only after the remaining generalisation and
   quality gates have real receipts.

