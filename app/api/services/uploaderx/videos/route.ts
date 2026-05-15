import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";
import {
  buildUploaderXPublicUrl,
  deleteUploaderXObject,
  uploadUploaderXObject,
} from "@/lib/uploaderx-storage";
import { addVideoToLink, removeVideoFromLinks } from "@/lib/shared/project-links";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.formData();
    const file = data.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const destination = `uploads/${session.userId}/${randomUUID()}-${file.name}`;

    await uploadUploaderXObject({
      key: destination,
      body: buffer,
      contentType: file.type || "application/octet-stream",
    });

    const gcsPath = destination;
    const publicUrl = buildUploaderXPublicUrl(gcsPath);

    // Optional: link to an Editron project + update its pipeline stage
    const editronProjectId = data.get("editronProjectId") as string | null;

    await connectToDatabase();
    const video = await UploaderX.create({
      userId: session.userId,
      editronProjectId: editronProjectId || null,
      videoUuid: randomUUID(),
      filename: file.name,
      gcsPath,
      publicUrl,
      size: file.size,
      contentType: file.type,
      status: "uploaded",
      uploadedAt: new Date(),
    });

    // If linked to a project, update its pipeline stage to "publish"
    if (editronProjectId) {
      try {
        const { projectService } = await import("@/lib/editron/services/project-service");
        await projectService.updateProjectMetadata(editronProjectId, {
          pipelineStage: "publish",
        });
        // Refresh derived project status after stage change
        await projectService.refreshProjectStatus(editronProjectId);
      } catch (e) {
        console.warn("[uploaderx] Failed to update project stage:", e);
      }

      // Wire video into project link chain (fail-open)
      try {
        const linked = await addVideoToLink(session.userId, editronProjectId, video.videoUuid);
        if (linked) {
          console.log(`[uploaderx/videos] Project link updated: project ${editronProjectId} → video ${video.videoUuid}`);
        }
      } catch (linkErr: any) {
        console.error(`[uploaderx/videos] Project link update failed: ${linkErr.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Video uploaded successfully",
      video,
    });
  } catch (error: any) {
    console.error("Upload failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const videos = await UploaderX.find({ userId: session.userId }).sort({ uploadedAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      videos: videos.map((video) => ({
        ...video,
        publicUrl: video.publicUrl || buildUploaderXPublicUrl(video.gcsPath),
      })),
    });
  } catch (error) {
    console.error("Error fetching uploads:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch uploads" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { videoUuid } = await request.json();
    if (!videoUuid) {
      return NextResponse.json({ success: false, error: "Missing videoUuid" }, { status: 400 });
    }

    await connectToDatabase();
    const deleted = await UploaderX.findOneAndDelete({
      userId: session.userId,
      videoUuid,
    });

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
    }

    try {
      await deleteUploaderXObject(deleted.gcsPath);
    } catch (err) {
      console.warn("R2 deletion failed:", err);
    }

    // Clean up project link references (fail-open)
    try {
      await removeVideoFromLinks(session.userId, videoUuid);
    } catch (linkErr: any) {
      console.error(`[uploaderx/videos] Link cleanup failed for video ${videoUuid}: ${linkErr.message}`);
    }

    return NextResponse.json({ success: true, message: "Video deleted" });
  } catch (error) {
    console.error("Error deleting video:", error);
    return NextResponse.json({ success: false, error: "Failed to delete video" }, { status: 500 });
  }
}
