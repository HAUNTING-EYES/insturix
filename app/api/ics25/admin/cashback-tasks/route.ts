import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminForApi } from "@/lib/auth/adminAuth";
import { getIcs25Db } from "@/lib/ics25-mongo";
import { ObjectId } from "mongodb";
import Ics25PromoReel from "@/schemas/ics25/PromoReelSubmission";
import Ics25LinkedInPromo from "@/schemas/ics25/LinkedInSubmission";
import Ics25Player from "@/schemas/ics25/Player";

export async function GET(req: NextRequest) {
  try {
    // Verify admin access
    const adminCheck = await verifyAdminForApi();
    if (!adminCheck.isAdmin) {
      return adminCheck.response;
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";

    await getIcs25Db();

    // Map status to the schema status
    const mappedStatus = status === 'pending' ? 'submitted' : status === 'approved' ? 'verified' : 'rejected';

    // Fetch PromoReel submissions
    const promoReels = await Ics25PromoReel.find({ status: mappedStatus }).lean();
    
    // Fetch LinkedIn submissions
    const linkedInPosts = await Ics25LinkedInPromo.find({ status: mappedStatus }).lean();

    // Get all unique player IDs
    const playerIds = [
      ...promoReels.map((t: any) => t.playerId),
      ...linkedInPosts.map((t: any) => t.playerId)
    ].filter(Boolean);

    // Fetch player details to get email and game
    const players = await Ics25Player.find({
      _id: { $in: playerIds.map(id => new ObjectId(id)) }
    }).lean();

    const playerMap = new Map(players.map((p: any) => [p._id.toString(), p]));

    // Transform to match the expected format
    const tasks: any[] = [];
    
    // Add PromoReel tasks
    promoReels.forEach((task: any) => {
      const player = playerMap.get(task.playerId);
      tasks.push({
        _id: task._id.toString(),
        userId: task.clerkUserId,
        userEmail: player?.email || task.instagram || 'N/A',
        userName: task.name,
        game: player?.game || 'valorant',
        taskType: 'instagram_story',
        submissionUrl: task.proofUrl || '',
        screenshotUrl: task.proofUrl || '',
        status: status,
        submittedAt: task.createdAt,
        reviewedAt: task.reviewedAt,
        reviewedBy: '',
        rejectionReason: '',
      });
    });
    
    // Add LinkedIn tasks
    linkedInPosts.forEach((task: any) => {
      const player = playerMap.get(task.playerId);
      tasks.push({
        _id: task._id.toString(),
        userId: task.clerkUserId,
        userEmail: player?.email || task.instagram || 'N/A',
        userName: task.name,
        game: player?.game || 'valorant',
        taskType: 'linkedin_post',
        submissionUrl: task.proofUrl || '',
        screenshotUrl: task.proofUrl || '',
        status: status,
        submittedAt: task.createdAt,
        reviewedAt: task.reviewedAt,
        reviewedBy: '',
        rejectionReason: '',
      });
    });

    // Sort by submission date (newest first)
    tasks.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    return NextResponse.json({
      ok: true,
      tasks: tasks,
    });
  } catch (error: any) {
    console.error("Error fetching cashback tasks:", error);
    return NextResponse.json(
      { ok: false, message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin access
    const adminCheck = await verifyAdminForApi();
    if (!adminCheck.isAdmin) {
      return adminCheck.response;
    }

    const body = await req.json();
    const { taskId, action, rejectionReason } = body;

    if (!taskId || !action) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    if (action !== "approve" && action !== "reject" && action !== "revert") {
      return NextResponse.json(
        { ok: false, message: "Invalid action" },
        { status: 400 }
      );
    }

    await getIcs25Db();

    // Update task status
    const updateData: any = {
      status: action === "approve" ? "verified" : action === "reject" ? "rejected" : "submitted",
      reviewedAt: action === "revert" ? undefined : new Date(),
    };

    // Remove reviewedAt if reverting
    if (action === "revert") {
      delete updateData.reviewedAt;
    }

    if (action === "reject" && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    // Try to find and update in PromoReel collection first
    let result = await Ics25PromoReel.updateOne(
      { _id: new ObjectId(taskId) },
      { $set: updateData }
    );

    // If not found in PromoReel, try LinkedIn collection
    if (result.matchedCount === 0) {
      result = await Ics25LinkedInPromo.updateOne(
        { _id: new ObjectId(taskId) },
        { $set: updateData }
      );
    }

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { ok: false, message: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Task ${action}d successfully`,
    });
  } catch (error: any) {
    console.error("Error updating cashback task:", error);
    return NextResponse.json(
      { ok: false, message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
