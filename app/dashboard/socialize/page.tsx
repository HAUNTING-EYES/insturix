import SocializeClientWrapper from "@/components/dashboard/Socialize/SocializeDashboard";
import { Share2 } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import mongoose from "mongoose";
import Socialize from "@/schemas/Socialize";
import { redirect } from "next/navigation";
import React, { Suspense } from "react";
import { UniversalLoader } from "@/components/Loader/UniversalLoader";

export const revalidate = 60;

async function connectToDatabase() {
  if (mongoose.connection.readyState !== 1) {
    // Avoid long default Mongoose timeouts by setting a short serverSelectionTimeout
    await mongoose.connect(process.env.MONGODB_URI as string, {
      serverSelectionTimeoutMS: 2500,
    });
  }
}

export default async function SocializePage() {
  const user = await currentUser();
  if (!user || !user.username) {
    redirect("/sign-in");
  }

  await connectToDatabase();

  // Fetch with lean and minimal projection to reduce payload + serialization
  const socializeData = await Socialize.findOne(
    { username: user.username },
    { __v: 0 }
  )
    .lean()
    .exec();

  // Safely stringify without heavy Date objects
  const serialized = socializeData
    ? JSON.parse(
        JSON.stringify(socializeData, (_, v) =>
          v instanceof Date ? v.toISOString() : v
        )
      )
    : null;

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
      <Suspense fallback={<UniversalLoader />}>
        <SocializeClientWrapper initialData={serialized} />
      </Suspense>
    </div>
  );
}
