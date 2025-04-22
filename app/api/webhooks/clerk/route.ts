import { verifyWebhook } from "@clerk/nextjs/webhooks";
import User, { IPlan } from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserType } from "@/types/userTypes";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase(process.env.MONGODB_URI || "");
    // @ts-expect-error - Clerk's verifyWebhook expects RequestLike but works with Request in practice
    const evt = await verifyWebhook(req.clone());

    if (evt.type === "user.created") {
      try {
        const now = new Date();
        const oneMonthLater = new Date(now);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

        const freePlan: IPlan = {
          name: UserType.Free,
          startDate: now,
          endDate: oneMonthLater,
          price: 0,
          status: "active",
          features: ["Basic access", "Limited storage", "Community support"],
        };

        const newUser = new User({
          clerkUserId: evt.data.id,
          email: evt.data.email_addresses?.[0]?.email_address,
          userType: UserType.Free,
          payments: [],
          signUpDate: now,
          currentPlan: freePlan,
          planHistory: [freePlan], // Initialize with the free plan
        });

        await newUser.save();
        console.log("User created successfully:", evt.data.id);
      } catch (dbError) {
        console.error("Error saving user to database:", dbError);
      }
    }
    return new Response("Webhook received", { status: 200 });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return new Response("Webhook received", { status: 200 });
  }
}
