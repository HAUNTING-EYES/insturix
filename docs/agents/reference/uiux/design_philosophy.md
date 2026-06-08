---
name: Design Philosophy — MANDATORY for every UI decision
description: ALWAYS READ. The thinking behind every visual and interaction choice. Referenced by pre-edit hook. If a design element can't be justified by one of these principles, it doesn't belong.
type: feedback
originSessionId: 6dfcea9c-1dfa-4c86-b541-6cfa97d28e93
---
# Design Philosophy — MANDATORY

**Every element must have a reason to exist. If you can't articulate why it's there, remove it.**

---

## The Five Lenses

Apply ALL five to every UI decision. If a design choice fails any lens, reconsider.

### 1. RAMS — "Good design is as little design as possible"
Dieter Rams, 10 Principles of Good Design.

- **Less, but better.** Every element earns its place or dies.
- **Good design is unobtrusive.** Products are tools, not decorations.
- **Good design is honest.** Don't make something appear more than it is.
- **Good design is long-lasting.** Avoid trends. Design for permanence.
- **Good design is thorough down to the last detail.** Nothing is arbitrary. Nothing is left to chance.

**How to apply:** Before adding ANY visual element, ask: "Does removing this make the product worse?" If no → remove it.

### 2. JOBS — "Design is how it works"
Steve Jobs, intersection of technology and liberal arts.

- Design is not decoration applied after engineering. It IS the product.
- **Simplicity is the ultimate sophistication.** Not simplistic — sophisticated enough that the complexity is invisible.
- **Start with the user experience and work backwards to the technology.** Never the reverse.
- The best interface is no interface. The second best is one that feels inevitable.
- **Say no to 1,000 things** to make sure you don't get on the wrong track.

**How to apply:** Before adding a feature/element, ask: "Would a user who has never seen this before understand what to do in 3 seconds?" If no → redesign.

### 3. IVE — "True simplicity is not the absence of clutter"
Jony Ive, reduction that reveals.

- Simplicity is not about taking things away. It's about bringing order to complexity.
- **Reduction reveals.** Remove until the essential structure emerges.
- Every material, every radius, every weight has intentional meaning.
- The design should feel inevitable — like no other choice was possible.
- **Depth through restraint.** A single gold accent on a dark surface says more than 10 colors.

**How to apply:** When something feels "empty," resist the urge to fill it. Ask: "Is this emptiness communicating focus?" If yes → keep it.

### 4. VIGNELLI — "Discipline of restraint"
Massimo Vignelli, typographic clarity and systematic design.

- **If you can design one thing, you can design everything.** Systems over one-offs.
- Typography IS design. The choice of typeface, weight, size, spacing — these ARE the visual language.
- **The grid is the backbone.** Every element relates to every other element through the grid.
- Reduce the palette until changing any single color would break the whole system.
- Consistency is not boring — it's trustworthy.

**How to apply:** Before introducing any new color, font, or spacing value, ask: "Is this already in the system?" If not → don't add it. Use what exists.

### 5. MÜLLER-BROCKMANN — "The grid system is an aid, not a guarantee"
Josef Müller-Brockmann, Swiss design and visual communication.

- **Communication over decoration.** Every element communicates or it's noise.
- Hierarchy is the most important design decision. What does the user see first, second, third?
- Whitespace is not empty — it's a structural element. It creates hierarchy, breathing room, and focus.
- **Rhythm and proportion** create visual comfort. Consistent spacing is felt, not seen.
- The user should never wonder "what am I supposed to do here."

**How to apply:** For every screen, ask: "What is the ONE thing the user should notice?" Everything else is secondary. If two things compete for attention → one of them is wrong.

---

## Applied to Insturix

| Principle | Insturix Application |
|---|---|
| Rams: unobtrusive | The editor chrome (sidebar, topbar, timeline) should disappear when the user is focused on their content |
| Jobs: start with experience | The landing page doesn't explain features — it SHOWS the experience of using the product |
| Ive: reduction reveals | Gold accent used ONLY for decisions — its rarity is what makes it powerful |
| Vignelli: systematic | Two fonts, one palette, three radii, one easing curve — the system IS the identity |
| Müller-Brockmann: hierarchy | On every screen, ONE thing dominates. The score (91). The prompt. The script. Never two things fighting |

---

## The Kill Test

Before shipping ANY UI element, answer:

1. **Why does this exist?** (Not "what" — "why")
2. **What happens if I remove it?** (If nothing breaks → remove it)
3. **Does it respect the hierarchy?** (Is there ONE clear focal point?)
4. **Is it in the system?** (Uses design tokens, not custom values?)
5. **Would Rams approve?** (Is it as little design as possible?)
