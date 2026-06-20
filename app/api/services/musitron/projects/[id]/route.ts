import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { getMusitronCollections } from "@/lib/services/musitron-mongo";
import { updateProjectSchema } from "@/lib/musitron/daw-types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: RouteContext) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid project ID" },
      { status: 400 }
    );
  }

  try {
    const { musitronProjects } = await getMusitronCollections();

    const filter = orgId
      ? { _id: ObjectId.createFromHexString(id), clerkUserId: userId, orgId }
      : { _id: ObjectId.createFromHexString(id), clerkUserId: userId };

    const project = await musitronProjects.findOne(filter);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error("[Musitron Projects] Get error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get project" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid project ID" },
      { status: 400 }
    );
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
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { musitronProjects } = await getMusitronCollections();

    const filter = orgId
      ? { _id: ObjectId.createFromHexString(id), clerkUserId: userId, orgId }
      : { _id: ObjectId.createFromHexString(id), clerkUserId: userId };

    const result = await musitronProjects.updateOne(filter, {
      $set: {
        ...parsed.data,
        updatedAt: new Date(),
      },
    });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Musitron Projects] Update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update project" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid project ID" },
      { status: 400 }
    );
  }

  try {
    const { musitronProjects } = await getMusitronCollections();

    const filter = orgId
      ? { _id: ObjectId.createFromHexString(id), clerkUserId: userId, orgId }
      : { _id: ObjectId.createFromHexString(id), clerkUserId: userId };

    const result = await musitronProjects.deleteOne(filter);
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Musitron Projects] Delete error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
