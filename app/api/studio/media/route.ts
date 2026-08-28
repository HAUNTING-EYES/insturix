import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/media — the composer's unified library (read-side).
 * Aggregates everything the user already has across engines via same-origin
 * bridges. Stock search joins as a separate tab client-side.
 */

export interface StudioMediaItem {
  id: string;
  engine: "editron" | "clickatron" | "thinkforge" | "musitron";
  kind: "video" | "image" | "script" | "audio";
  title: string;
  role: "media" | "image" | "script";
  updatedAt: string | null;
}

export async function GET(req: Request) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const origin = new URL(req.url).origin;
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  const j = async (path: string): Promise<Record<string, unknown> | null> => {
    try {
      const r = await fetch(new URL(path, origin), { headers });
      return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const items: StudioMediaItem[] = [];

  const [media, canvases, scripts, tracks] = await Promise.all([
    j("/api/services/editron/media/list?limit=30"),
    j("/api/services/clickatron/history?limit=20"),
    j("/api/services/thinkforge/script/list-all?limit=30"),
    j("/api/services/musitron/history?page=1&limit=20"),
  ]);

  const mediaList = (media?.media ?? media?.assets ?? media?.items) as Array<Record<string, unknown>> | undefined;
  for (const m of mediaList ?? []) {
    const id = String(m.assetId ?? m.id ?? "");
    if (!id) continue;
    items.push({
      id,
      engine: "editron",
      kind: String(m.type ?? "").includes("image") ? "image" : "video",
      title: String(m.filename ?? m.name ?? "media"),
      role: String(m.type ?? "").includes("image") ? "image" : "media",
      updatedAt: m.updatedAt ? new Date(m.updatedAt as string).toISOString() : null,
    });
  }

  const history = (canvases?.history ?? []) as Array<Record<string, unknown>>;
  for (const c of history) {
    const id = String(c.sessionId ?? "");
    if (!id) continue;
    items.push({ id, engine: "clickatron", kind: "image", title: String(c.title ?? "canvas"), role: "image", updatedAt: c.updatedAt ? new Date(c.updatedAt as string).toISOString() : null });
  }

  const scriptList = (scripts?.scripts ?? scripts?.data ?? scripts) as unknown;
  if (Array.isArray(scriptList)) {
    for (const s of scriptList as Array<Record<string, unknown>>) {
      const id = String(s.sessionId ?? s.id ?? "");
      if (!id) continue;
      items.push({ id, engine: "thinkforge", kind: "script", title: String(s.name ?? s.title ?? "draft"), role: "script", updatedAt: null });
    }
  }

  const trackList = (tracks?.data ?? []) as Array<Record<string, unknown>>;
  for (const t of trackList) {
    const id = String(t._id ?? t.id ?? "");
    if (!id) continue;
    items.push({ id, engine: "musitron", kind: "audio", title: String(t.title ?? "track"), role: "media", updatedAt: null });
  }

  return NextResponse.json({ items });
}
