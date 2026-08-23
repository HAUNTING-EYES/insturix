/**
 * Phase 1 mock fixtures — typed against lib/studio/contracts.
 * The Summer drop demo (approved interaction model) plus a written
 * deliverable, so Home and the session both have real-shaped data.
 * Phase 2 replaces the store with adapters; components only see contracts.
 */

import type {
  StudioArtifact,
  StudioDeliverable,
  StudioThreadItem,
} from "@/lib/studio/contracts/objects";

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

export const MOCK_BRANDS = [
  { id: "br_nike", name: "Nike" },
  { id: "br_alo", name: "Alo Yoga" },
] as const;

export const MOCK_WALLET = { main: 328, media: 240, orgScoped: false };

const artifacts: StudioArtifact[] = [
  {
    id: "art_script",
    kind: "script",
    status: "done",
    title: "Script",
    sourceRef: { engine: "thinkforge", externalId: "tf_s_042", manualHref: null },
    revisions: [{ id: "rev2", createdAt: iso(9 * 60000), checkpointRef: null, summary: "hook rewritten — kept punchiest of 3" }],
    updatedAt: iso(9 * 60000),
    createdAt: iso(52 * 60000),
  },
  {
    id: "art_reel",
    kind: "reel",
    status: "done",
    title: "Reel",
    sourceRef: { engine: "editron", externalId: "proj_8801", manualHref: "/dashboard/editron/project/proj_8801" },
    revisions: [{ id: "rev4", createdAt: iso(2 * 60000), checkpointRef: "ckpt_55c1", summary: "re-cut open 00:00–00:03" }],
    updatedAt: iso(2 * 60000),
    createdAt: iso(48 * 60000),
  },
  {
    id: "art_thumb",
    kind: "thumbnail",
    status: "running",
    title: "Thumbnail",
    sourceRef: { engine: "clickatron", externalId: "cv_31f", manualHref: "/dashboard/clickatron/lab/cv_31f" },
    progress: { stage: "stage 2/4 · variations", percent: null },
    revisions: [],
    updatedAt: iso(4 * 60000),
    createdAt: iso(46 * 60000),
  },
  {
    id: "art_sched",
    kind: "schedule",
    status: "queued",
    title: "Schedule",
    sourceRef: { engine: "calos", externalId: "cal_d_77", manualHref: "/dashboard/calos" },
    revisions: [],
    updatedAt: iso(46 * 60000),
    createdAt: iso(46 * 60000),
  },
];

export const MOCK_DELIVERABLE: StudioDeliverable = {
  id: "del_summer",
  title: "Summer drop — launch",
  brandId: "br_nike",
  orgId: null,
  campaignId: null,
  threadId: "th_summer",
  artifacts,
  edges: [
    { id: "e1", kind: "derived_from", fromArtifactId: "art_reel", toArtifactId: "art_script", createdAt: iso(48 * 60000) },
    { id: "e2", kind: "stale_if", fromArtifactId: "art_thumb", toArtifactId: "art_script", createdAt: iso(46 * 60000) },
    { id: "e3", kind: "stale_if", fromArtifactId: "art_sched", toArtifactId: "art_reel", createdAt: iso(46 * 60000) },
    { id: "e4", kind: "attaches_to", fromArtifactId: "art_thumb", toArtifactId: "art_reel", createdAt: iso(46 * 60000) },
  ],
  stageFocus: {
    artifactId: "art_reel",
    reason: "agent_working",
    why: "re-cut the opening · just now",
    since: iso(2 * 60000),
  },
  createdAt: iso(52 * 60000),
  updatedAt: iso(2 * 60000),
};

export const MOCK_DELIVERABLE_EMAIL: StudioDeliverable = {
  id: "del_email",
  title: "Launch email",
  brandId: "br_nike",
  orgId: null,
  campaignId: null,
  threadId: "th_email",
  artifacts: [
    {
      id: "art_email",
      kind: "script",
      status: "done",
      title: "Email",
      sourceRef: { engine: "thinkforge", externalId: "tf_s_043", manualHref: null },
      revisions: [],
      updatedAt: iso(28 * 60000),
      createdAt: iso(30 * 60000),
    },
  ],
  edges: [],
  stageFocus: { artifactId: "art_email", reason: "artifact_changed", why: "sharpened the close", since: iso(28 * 60000) },
  createdAt: iso(30 * 60000),
  updatedAt: iso(28 * 60000),
};

/** The thread as it exists at session open — the approved demo, mid-flight. */
export const MOCK_THREAD: StudioThreadItem[] = [
  {
    kind: "user",
    id: "m1",
    text: "Make a 30s launch reel for the summer drop — Nike voice. Then a thumbnail, and schedule it Tue–Fri across our channels.",
    attachments: [],
    mentions: [],
    createdAt: iso(52 * 60000),
  },
  {
    kind: "plan",
    id: "m2",
    turnId: "t1",
    summary: "On it — writing, cutting, designing, and scheduling.",
    steps: [
      { id: "s1", capability: "write", toolName: "script-author-agent", label: "Wrote the script", riskLevel: "medium", state: "done" },
      { id: "s2", capability: "edit", toolName: "auto_edit_from_script", label: "Cut the reel", riskLevel: "high", state: "done" },
      { id: "s3", capability: "design", toolName: "create-image-job", label: "Making the thumbnail", riskLevel: "medium", state: "running" },
      { id: "s4", capability: "distribute", toolName: "cadence-suggest", label: "Scheduling", riskLevel: "low", state: "pending" },
    ],
    createdAt: iso(51 * 60000),
  },
  {
    kind: "artifact_born",
    id: "m3",
    artifactIds: ["art_script", "art_reel", "art_thumb", "art_sched"],
    createdAt: iso(46 * 60000),
  },
  {
    kind: "prose",
    id: "m4",
    text: "Script and reel are ready (showing the reel). Thumbnail's generating; schedule's drafted, waiting on it.",
    createdAt: iso(44 * 60000),
  },
  {
    kind: "user",
    id: "m5",
    text: "Hook's a bit weak — punch it up, and re-cut the open to match.",
    attachments: [],
    mentions: [],
    createdAt: iso(10 * 60000),
  },
  {
    kind: "plan",
    id: "m6",
    turnId: "t2",
    summary: "Rewrote the hook and re-cut the opening.",
    steps: [
      { id: "s5", capability: "write", toolName: "script-refinement-agent", label: "Rewrote the hook", riskLevel: "medium", state: "done" },
      { id: "s6", capability: "edit", toolName: "cut_section", label: "Re-cut the open", riskLevel: "high", state: "done" },
    ],
    createdAt: iso(9 * 60000),
  },
  {
    kind: "receipt",
    id: "m7",
    label: "Cut section",
    detail: "14 clips · 00:30 · auto_edit v2",
    creditsConsumed: 2,
    createdAt: iso(9 * 60000),
  },
  {
    kind: "prose",
    id: "m8",
    text: "Updated the reel — the new opening is highlighted on the right. Want the thumbnail to match the new hook line too?",
    createdAt: iso(2 * 60000),
  },
  {
    kind: "quick_replies",
    id: "m9",
    options: ["yes, match it", "show me the thumbnail", "schedule it"],
    createdAt: iso(2 * 60000),
  },
];

export const CAPABILITY_COLOR: Record<string, string> = {
  write: "var(--c-write)",
  edit: "var(--c-edit)",
  design: "var(--c-design)",
  analyze: "var(--c-analyze)",
  distribute: "var(--c-distribute)",
};

export const ARTIFACT_VIEW_META: Record<string, { label: string; dot: string }> = {
  script: { label: "Script", dot: "var(--c-write)" },
  reel: { label: "Reel", dot: "var(--c-edit)" },
  thumbnail: { label: "Thumbnail", dot: "var(--c-design)" },
  image_canvas: { label: "Canvas", dot: "var(--c-design)" },
  schedule: { label: "Schedule", dot: "var(--c-distribute)" },
  analysis: { label: "Analysis", dot: "var(--c-analyze)" },
  music: { label: "Music", dot: "var(--c-design)" },
};
