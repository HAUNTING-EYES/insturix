/**
 * Plan §10 / Phase 4 — the ThinkForge control room is out of the normal
 * path; the studio Write stage is the writing surface. Deep links carrying
 * a TF session id (?session= from DashboardHome, ?sessionId= from the
 * CalOS calendar) land on the studio project page, which imports that
 * session's history via the spine; every other entry lands on studio Home.
 * All temporary (302) — Phase 10 deletes the legacy route outright.
 */

export interface LegacyRedirect {
  source: string;
  destination: string;
  permanent: boolean;
  has?: Array<{ type: "query"; key: string; value: string }>;
}

export const thinkforgeRedirects: LegacyRedirect[] = [
  {
    source: "/dashboard/thinkforge",
    has: [{ type: "query", key: "session", value: "(?<sid>[^&]+)" }],
    destination: "/studio/d/:sid",
    permanent: false,
  },
  {
    source: "/dashboard/thinkforge",
    has: [{ type: "query", key: "sessionId", value: "(?<sid>[^&]+)" }],
    destination: "/studio/d/:sid",
    permanent: false,
  },
  {
    source: "/dashboard/thinkforge",
    destination: "/studio",
    permanent: false,
  },
];
