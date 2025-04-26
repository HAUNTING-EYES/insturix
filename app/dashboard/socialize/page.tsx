import SocializeClientWrapper from "@/components/dashboard/Socialize/SocializeDashboard";
import { Share2 } from "lucide-react";

export default function SocializePage() {
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
      <SocializeClientWrapper />
    </div>
  );
}
