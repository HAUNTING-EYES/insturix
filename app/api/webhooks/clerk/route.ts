import { verifyWebhook } from "@clerk/nextjs/webhooks";
import User from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";

export async function POST(req: Request) {
  try {
    await connectToDatabase(process.env.MONGODB_URI || "");
    const evt = await verifyWebhook(req.clone());
    if (evt.type === "user.created") {
      try {
        const newUser = new User({
          clerkUserId: evt.data.id,
          email: evt.data.email_addresses?.[0]?.email_address || "",
          userType: "Free",
          payments: [],
        });
        await newUser.save();
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
