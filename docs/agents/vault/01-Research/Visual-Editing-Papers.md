# Visual Editing Papers

Research paper findings from the Editron video editing system architecture review. These papers inform the visual understanding and non-speech editing directions for Insturix.

---

## EditDuet (SIGGRAPH 2025, Adobe Research)

- Editor+Critic multi-agent architecture
- Critic evaluates structure/relevance/aesthetic/pacing WITHOUT rendering
- Natural language feedback loop between editor and critic
- Key insight: You can evaluate an edit PLAN without rendering it
- Link: https://arxiv.org/abs/2509.10761
- Relevance to Insturix: Validates structural gate approach. Suggests adding a CRITIC role, not just a score. Could be used for quality review of creative brief decisions before EDL execution.

## HIVE (EMNLP 2025)

- Decomposes editing into: highlight detection + pruning irrelevant content
- Uses MULTIMODAL understanding (speech + visual + narrative)
- Key insight: "What's interesting?" is more intuitive than "where to cut?"
- The editorial question should be "which moments deserve to stay?" not "where do I place a cut?"
- Link: https://arxiv.org/abs/2507.02790
- Relevance: Exactly our problem. Shows multimodal is needed, not just speech OR vision. The highlight+prune pattern could replace the creative brief's "place decisions at word indices" approach.

## MVAA (arxiv 2025)

- Beat-aligned video editing with arbitrary music
- Two-stage approach: first analyze music structure, then align edits
- Key insight: Music-driven editing needs beat hierarchy, not just binary beat detection
- Link: https://arxiv.org/html/2506.18881v1
- Relevance: Validates our D6 beat hierarchy (7 levels). Confirms that music-only content needs beat-aligned coordinates, not word indices.

## VQ-Insight (arxiv 2025)

- VLM-based quality assessment
- LLM scores video quality using vision models
- Key insight: Visual quality assessment can be done by LLMs, not just traditional metrics (BRISQUE, NIQE)
- Link: https://arxiv.org/pdf/2506.18564
- Relevance: Interesting for Tier 2 aesthetic gate but NOT for editorial quality. VQA measures TECHNICAL quality (compression, noise). We need EDITORIAL quality ("is this moment worth showing?"). Different problem.

---

## Key Synthesis (from editron 26 research)

### Three things the research says NOT to do

1. Don't gate existing functionality on new visual data (our Phase 1C lesson confirmed by literature)
2. Don't build per-frame scoring when you need editorial judgment (VQA vs HIVE distinction)
3. Don't force speech-first architecture to handle non-speech (Descript's limitation, confirmed by every transcript-first tool)

### Three directions worth exploring

1. EditDuet's Critic agent pattern -- evaluate the editing PLAN, not individual frames
2. HIVE's multimodal narrative decomposition -- understand content holistically first
3. MVAA's beat-aligned coordinate system -- for music-dominant content

---

## Industry Landscape

- **Descript** = transcript-first. Fails on music-only content. Same problem as Editron.
- **OpusClip** = speech analysis. Fails on music-only. Same problem.
- **CapCut** = visual-first. Handles music-only content. Different architecture (not transcript-anchored).
- **Nobody has solved both speech + non-speech editing.** This is a genuine unsolved problem in the industry.

---

Tags: #research #papers #visual-editing #non-speech
