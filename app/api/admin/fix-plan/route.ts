import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import Plan from "@/schemas/plans";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const freePlan = await Plan.findOne({ type: "free", isActive: true }).lean();

    if (!freePlan) {
      const allPlans = await Plan.find({}).lean();
      return NextResponse.json({
        error: "No free plan found",
        availablePlans: allPlans.map((p: any) => ({
          id: p._id?.toString(),
          name: p.name,
          type: p.type,
          isActive: p.isActive,
        })),
      });
    }

    const brokenUsers = await User.find({
      "currentPlan.planId": { $nin: await Plan.distinct("_id") },
    }).lean();

    const brokenCount = brokenUsers?.length || 0;

    if (brokenCount === 0) {
      return NextResponse.json({
        message: "No broken users found",
        freePlanId: freePlan._id?.toString(),
      });
    }

    const result = await User.updateMany(
      { "currentPlan.planId": { $nin: await Plan.distinct("_id") } },
      {
        $set: {
          "currentPlan.planId": freePlan._id?.toString(),
          "currentPlan.name": "free",
          "currentPlan.status": "active",
        },
      }
    );

    return NextResponse.json({
      message: `Fixed ${result.modifiedCount} users`,
      freePlanId: freePlan._id?.toString(),
      freePlanName: freePlan.name,
      usersFixed: result.modifiedCount,
      brokenUserEmails: brokenUsers.map((u: any) => u.email),
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
