import SocializeClientWrapper from "@/components/dashboard/Socialize/SocializeDashboard";
import { Share2 } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import mongoose from "mongoose";
import Socialize from "@/schemas/Socialize";
import { redirect } from "next/navigation";

async function connectToDatabase() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI as string);
  }
}

export default async function SocializePage() {
  const user = await currentUser();
  if (!user || !user.username) {
    redirect("/sign-in");
  }

  await connectToDatabase();

  const socializeData = await Socialize.findOne({
    username: user.username,
  }).lean();

  return (
    <div className="container mx-auto p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 flex items-center gap-3">
          <Share2 className="h-8 w-8 text-[#0ea5e9]" />
          Socialize
        </h1>
        <p className="mt-3 text-lg text-zinc-400 font-light">
          Connect your audience to all your content with one simple link
        </p>
      </div>

      {/* Dashboard Content */}
      <SocializeClientWrapper
        initialData={JSON.parse(JSON.stringify(socializeData))}
      />
    </div>
  );
}
