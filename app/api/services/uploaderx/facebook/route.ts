import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderXVideo from "@/schemas/uploaderx-video";
import axios from "axios";
import FormData from "form-data";
import { fetchUploaderXBuffer, resolveUploaderXVideo } from "@/lib/uploaderx-storage";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { gcsPath, videoUuid, title, description, pageId: requestedPageId } = body;

    if (!gcsPath) {
      return NextResponse.json({ success: false, error: "Missing gcsPath" }, { status: 400 });
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");

    const user = await User.findOne({
      clerkUserId: session.userId,
      facebookTokens: { $exists: true, $ne: null },
    });

    if (!user?.facebookTokens) {
      return NextResponse.json(
        {
          success: false,
          error: "Facebook not connected. Please connect your Facebook account first.",
        },
        { status: 403 }
      );
    }

    const fb = user.facebookTokens as any;
    const pages = fb.pages || [];
    if (pages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No Facebook Pages found. You need at least one Page to upload videos.",
        },
        { status: 400 }
      );
    }

    const targetPage = requestedPageId
      ? pages.find((page: any) => page.pageId === requestedPageId)
      : pages[0];

    if (!targetPage) {
      return NextResponse.json(
        { success: false, error: "Requested Facebook Page not found." },
        { status: 400 }
      );
    }

    try {
      const refreshPageTokenRes = await fetch(
        `https://graph.facebook.com/v21.0/${targetPage.pageId}?fields=access_token&access_token=${fb.userAccessToken}`
      );
      const refreshPageTokenData = await refreshPageTokenRes.json();
      if (refreshPageTokenData.access_token) {
        targetPage.pageAccessToken = refreshPageTokenData.access_token;
      }
    } catch (refreshError) {
      console.warn("Failed to refresh Facebook page token:", refreshError);
    }

    let existingFbVideoId: string | null = null;
    let videoDoc = null;

    if (videoUuid) {
      videoDoc = await UploaderXVideo.findOne({ videoUuid });
      if (videoDoc?.metadata?.facebook?.videoId) {
        existingFbVideoId = videoDoc.metadata.facebook.videoId;
      }
    }

    let finalTitle = title;
    let finalDescription = description;

    if (videoDoc?.metadata) {
      const meta = videoDoc.metadata;
      if (meta.facebook) {
        finalTitle = finalTitle || meta.facebook.title || meta.title;
        finalDescription = finalDescription || meta.facebook.description || meta.description;
      } else {
        finalTitle = finalTitle || meta.title;
        finalDescription = finalDescription || meta.description;
      }
    }

    finalTitle = finalTitle || "Uploaded via UploaderX";
    finalDescription = finalDescription || "";

    if (existingFbVideoId) {
      const updateRes = await fetch(`https://graph.facebook.com/v21.0/${existingFbVideoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: targetPage.pageAccessToken,
          title: finalTitle,
          description: finalDescription,
        }),
      });

      const updateData = await updateRes.json();
      if (updateData.error) {
        return NextResponse.json(
          {
            success: false,
            error: updateData.error.message || "Failed to update video on Facebook",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        facebookUrl: `https://www.facebook.com/${targetPage.pageId}/videos/${existingFbVideoId}`,
        videoId: existingFbVideoId,
        updated: true,
      });
    }

    const videoAsset = await resolveUploaderXVideo({ videoUuid, gcsPath });
    const fileSize = Number(videoAsset.size || 0);
    const fileName = videoAsset.filename || gcsPath.split("/").pop() || "video.mp4";
    const contentType = videoAsset.contentType || "video/mp4";

    const useResumableUpload = fileSize > 10 * 1024 * 1024;
    if (!useResumableUpload) {
      const nodeFormData = new FormData();
      const videoResponse = await axios.get(videoAsset.publicUrl, { responseType: "stream" });

      nodeFormData.append("source", videoResponse.data, {
        filename: fileName,
        contentType,
      });
      if (finalTitle) {
        nodeFormData.append("title", finalTitle);
      }
      if (finalDescription) {
        nodeFormData.append("description", finalDescription);
      }

      const simpleUploadUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;

      try {
        const simpleRes = await axios.post(simpleUploadUrl, nodeFormData, {
          headers: nodeFormData.getHeaders(),
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        const simpleData = simpleRes.data;
        if (!simpleData.error) {
          const facebookUrl = `https://www.facebook.com/${targetPage.pageId}/videos/${simpleData.id}`;
          if (videoUuid) {
            await UploaderXVideo.updateOne(
              { videoUuid },
              {
                $set: {
                  "metadata.facebook.videoId": simpleData.id,
                  "metadata.facebook.url": facebookUrl,
                  "metadata.facebook.pageId": targetPage.pageId,
                  "metadata.facebook.pageName": targetPage.pageName,
                  "metadata.facebook.lastUploadedAt": new Date(),
                },
              }
            );
          }

          return NextResponse.json({
            success: true,
            facebookUrl,
            videoId: simpleData.id,
            pageName: targetPage.pageName,
          });
        }
      } catch (simpleError: any) {
        console.warn("Facebook simple upload failed, falling back to resumable upload:", simpleError.message);
      }
    }

    const initUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
    const initRes = await fetch(initUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_phase: "start",
        file_size: fileSize,
      }),
    });

    const initData = await initRes.json();
    if (initData.error) {
      return NextResponse.json(
        {
          success: false,
          error: initData.error.message || "Failed to initialize Facebook upload",
        },
        { status: 500 }
      );
    }

    const uploadSessionId = initData.upload_session_id;
    const videoId = initData.video_id;
    const fileBuffer = await fetchUploaderXBuffer(videoAsset.publicUrl);

    const transferFormData = new FormData();
    transferFormData.append("upload_phase", "transfer");
    transferFormData.append("upload_session_id", uploadSessionId);
    transferFormData.append("start_offset", "0");
    transferFormData.append("video_file_chunk", fileBuffer, {
      filename: fileName,
      contentType,
    });

    const transferUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;

    try {
      const transferRes = await axios.post(transferUrl, transferFormData, {
        headers: transferFormData.getHeaders(),
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      if (transferRes.data?.error) {
        return NextResponse.json(
          {
            success: false,
            error: transferRes.data.error.message || "Failed to transfer video to Facebook",
          },
          { status: 500 }
        );
      }
    } catch (transferError: any) {
      if (transferError.code === "ECONNABORTED") {
        return NextResponse.json(
          {
            success: false,
            error: "Upload timed out. Please try again with a smaller video or better connection.",
          },
          { status: 500 }
        );
      }
      throw transferError;
    }

    try {
      const finishUrl = `https://graph.facebook.com/v21.0/${targetPage.pageId}/videos?access_token=${encodeURIComponent(targetPage.pageAccessToken)}`;
      const finishRes = await axios.post(
        finishUrl,
        {
          upload_phase: "finish",
          upload_session_id: uploadSessionId,
          title: finalTitle,
          description: finalDescription,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 60000,
        }
      );

      if (finishRes.data?.error) {
        return NextResponse.json(
          {
            success: false,
            error: finishRes.data.error.message || "Failed to finish Facebook upload",
          },
          { status: 500 }
        );
      }
    } catch (finishError: any) {
      return NextResponse.json(
        { success: false, error: `Failed to finish Facebook upload: ${finishError.message}` },
        { status: 500 }
      );
    }

    const facebookUrl = `https://www.facebook.com/${targetPage.pageId}/videos/${videoId}`;
    if (videoUuid) {
      await UploaderXVideo.updateOne(
        { videoUuid },
        {
          $set: {
            "metadata.facebook.videoId": videoId,
            "metadata.facebook.url": facebookUrl,
            "metadata.facebook.pageId": targetPage.pageId,
            "metadata.facebook.pageName": targetPage.pageName,
            "metadata.facebook.lastUploadedAt": new Date(),
          },
        }
      );
    }

    return NextResponse.json({
      success: true,
      facebookUrl,
      videoId,
      pageName: targetPage.pageName,
    });
  } catch (error: any) {
    console.error("Facebook operation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Facebook upload failed" },
      { status: 500 }
    );
  }
}
