# ICS’25 Portal UI Notes

This doc captures the UI/UX patterns and knobs for the ICS’25 player portal to keep the experience consistent and easy to extend.

## Components and layout

- Portal entry: `app/ics25/my/page.tsx`
  - Renders `Navbar`, gradient background, and `PortalManager`.
  - The page title above the portal is omitted to avoid duplicate headings—the portal header shows context and actions.

- Portal manager: `components/ics25/PortalManager.tsx`
  - Top header shows:
    - Title, short description
    - Payment badge (Paid/Pending) and Pay Now CTA
    - Context line: Game and team (name + code + copy)
    - "Next steps" action chips (Complete registration / Join or create team / Complete payment) rendered based on gaps in state
  - Sticky tabs (Registration, Team, Cashbacks, Event, Payment):
    - Positioned with a subtle backdrop blur for quick navigation
    - Adjust `top` offset in the sticky wrapper if the navbar height changes

- Team card
  - Summary metrics (members, paid, slots left, leader)
  - Progress bar using shared `Progress` component
  - Actions: Copy invite link, Leave team (non-leader), Delete team (leader)

- Members list
  - Shows leader badge, payment badge (Paid/Awaiting)
  - Leader can remove members inline

- Browse teams
  - Search by name/code, pagination
  - Better affordances for request states: Requested (disabled outline) + Cancel side-by-side

- Registration tab
  - Read-only view by default with Edit toggle
  - Email and Game are locked; game-specific fields (BGMI/Valorant) edit inline

- Payment tab
  - Fee summary card with ₹ 500 and info text
  - Referral code: Check validator with clear messaging
  - Razorpay Pay Now; verified state shows a success message

- Cashbacks tab
  - Summary (Earned/Pending Review)
  - Tasks: Promo Reel, LinkedIn (statuses, submission input)
  - Referral generator + shareable link

## Visual system

- Uses shared UI primitives in `components/ui` (Card, Button, Badge, Tabs, Progress, Skeleton, AlertDialog)
- Dark-friendly with subtle borders (`border-white/10`) and gradients; adjust to match global theme as needed

## Common tweaks

- Sticky tabs offset: edit the wrapper in `PortalManager.tsx`, class `sticky top-20` → tune `top-*` to match Navbar height
- Team size caps: determined from `game` (Valorant 5, BGMI 4). Adjust the logic near `maxMembers` if new games are added
- Payment amount text: update the ₹ amount in the Payment card if pricing changes (actual charge is read from server on order creation)

## Gotchas

- The repo has unrelated type errors; run local checks focusing on files you edit. The portal files compile clean.
- Ensure environment is configured for DB and Razorpay to test end-to-end.

## Extending

- To add a new tab, reuse `TabsTrigger`/`TabsContent`, and keep the header consistent
- Prefer small cards with clear titles/descriptions and visible actions over long forms
- For async actions: toast success and errors; compute optimistic UI where safe
