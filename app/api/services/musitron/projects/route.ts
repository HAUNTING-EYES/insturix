import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getMusitronCollections } from "@/lib/services/musitron-mongo";
import {
  createProjectSchema,
  createDefaultProject,
} from "@/lib/musitron/daw-types";

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { musitronProjects } = await getMusitronCollections();

    const filter = orgId
      ? { clerkUserId: userId, orgId }
      : { clerkUserId: userId, $or: [{ orgId: { $exists: false } }, { orgId: null }] };

    const projects = await musitronProjects
      .aggregate([
        { $match: filter },
        { $sort: { updatedAt: -1 } },
        { $limit: 50 },
        {
          $project: {
            name: 1,
            bpm: 1,
            duration: 1,
            createdAt: 1,
            updatedAt: 1,
            trackCount: { $size: { $ifNull: ["$tracks", []] } },
          },
        },
      ])
      .toArray();

    return NextResponse.json({ success: true, projects });
  } catch (error) {
    console.error("[Musitron Projects] List error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list projects" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { musitronProjects } = await getMusitronCollections();

    const project = createDefaultProject(userId, parsed.data.name, orgId ?? undefined);

    if (parsed.data.bpm) project.bpm = parsed.data.bpm;
    if (parsed.data.timeSignature) project.timeSignature = parsed.data.timeSignature;
    if (parsed.data.sampleRate) project.sampleRate = parsed.data.sampleRate;

    const result = await musitronProjects.insertOne(project);

    return NextResponse.json({
      success: true,
      projectId: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("[Musitron Projects] Create error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create project" },
      { status: 500 }
    );
  }
}
