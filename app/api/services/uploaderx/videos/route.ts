import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import {
  buildUploaderXPublicUrl,
  deleteUploaderXObject,
  uploadUploaderXObject,
} from "@/lib/uploaderx-storage";
import { addVideoToLink, removeVideoFromLinks } from "@/lib/shared/project-links";
import {
  UploaderXProjectPublicationBlockedErrorV1,
  bindUploaderXProjectVideoV1,
  commitUploaderXProjectVideoV1,
} from "@/lib/editron/services/uploaderx-project-publication-v1";
import { ProjectNotFoundOrForbiddenError } from "@/lib/editron/services/project-service";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const user = await currentUser();
    if (!session?.userId || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ success: false, error: "User email not found" }, { status: 400 });
    }

    const data = await req.formData();
    const file = data.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const videoUuid = randomUUID();
    const destination = `uploads/${session.userId}/${randomUUID()}-${file.name}`;
    const contentType = file.type || "application/octet-stream";
    const objectKeySha256 = createHash("sha256").update(destination, "utf8").digest("hex");
    const contentSha256 = createHash("sha256").update(buffer).digest("hex");
    const editronProjectId = data.get("editronProjectId") as string | null;
    let projectBinding;

    if (editronProjectId) {
      try {
        projectBinding = await bindUploaderXProjectVideoV1({
          userId: session.userId,
          projectId: editronProjectId,
          videoUuid,
          objectKeySha256,
          contentSha256,
          sizeBytes: file.size,
          contentType,
        });
      } catch (error) {
        if (error instanceof ProjectNotFoundOrForbiddenError) {
          return NextResponse.json({ success: false, error: "Editron project not found" }, { status: 404 });
        }
        if (error instanceof UploaderXProjectPublicationBlockedErrorV1) {
          return NextResponse.json({
            success: false,
            error: "Project upload binding blocked",
            reason: error.reason,
          }, { status: 409 });
        }
        throw error;
      }
    }

    await uploadUploaderXObject({
      key: destination,
      body: buffer,
      contentType,
    });

    const gcsPath = destination;
    const publicUrl = buildUploaderXPublicUrl(gcsPath);

    let video;
    try {
      await connectToDatabase();
      video = await UploaderXVideo.create({
        userId: session.userId,
        email,
        editronProjectId: editronProjectId || null,
        videoUuid,
        filename: file.name,
        gcsPath,
        publicUrl,
        size: file.size,
        contentType,
        status: "uploaded",
        uploadedAt: new Date(),
        metadata: projectBinding ? {
          editronProjectPublicationV1: {
            schemaVersion: 1,
            status: "PENDING",
            binding: projectBinding,
          },
        } : undefined,
      });
    } catch (error) {
      try {
        await deleteUploaderXObject(destination);
      } catch {
        // Preserve the original database failure instead of masking it with cleanup failure.
      }
      throw error;
    }

    let projectProjection: Record<string, unknown> = { status: "NOT_LINKED" };
    if (projectBinding) {
      try {
        const result = await commitUploaderXProjectVideoV1({
          userId: session.userId,
          binding: projectBinding,
          objectKeySha256,
          contentSha256,
          sizeBytes: file.size,
          contentType,
        });
        projectProjection = {
          status: "COMMITTED",
          replayed: result.replayed,
          publication: result.publication,
          observedProjectRevision: result.observedProjectRevision,
        };
      } catch (error) {
        projectProjection = error instanceof UploaderXProjectPublicationBlockedErrorV1
          ? { status: "BLOCKED", reason: error.reason }
          : { status: "UNVERIFIABLE" };
        video.metadata = {
          ...video.metadata,
          editronProjectPublicationV1: {
            schemaVersion: 1,
            binding: projectBinding,
            ...projectProjection,
          },
        };
        video.markModified("metadata");
        await video.save();
        return NextResponse.json({
          success: false,
          error: error instanceof UploaderXProjectPublicationBlockedErrorV1
            ? "Project upload publication blocked"
            : "Project upload publication could not be verified",
          uploadRetained: true,
          videoUuid,
          projectProjection,
        }, { status: error instanceof UploaderXProjectPublicationBlockedErrorV1 ? 409 : 503 });
      }

      video.metadata = {
        ...video.metadata,
        editronProjectPublicationV1: {
          schemaVersion: 1,
          binding: projectBinding,
          ...projectProjection,
        },
      };
      video.markModified("metadata");
      try {
        await video.save();
      } catch {
        return NextResponse.json({
          success: false,
          error: "Project committed but the upload receipt could not be verified",
          uploadRetained: true,
          videoUuid,
          projectProjection,
          uploadReceipt: { status: "UNVERIFIABLE" },
        }, { status: 503 });
      }

      try {
        await addVideoToLink(session.userId, projectBinding.projectId, video.videoUuid);
      } catch (linkErr: any) {
        console.error(`[uploaderx/videos] Project link update failed: ${linkErr.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Video uploaded successfully",
      video,
      projectProjection,
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
    const videos = await UploaderXVideo.find({ userId: session.userId }).sort({ uploadedAt: -1 }).lean();

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
    const deleted = await UploaderXVideo.findOneAndDelete({
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
