// components/dashboard/shield/ShieldLandingPage.tsx
import { Shield } from "lucide-react";

export default function ShieldLandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12">
      <div className="flex flex-col items-center gap-6 bg-zinc-900/70 rounded-xl shadow-lg p-10 w-full max-w-xl">
        <Shield className="h-16 w-16 text-[#a855f7] drop-shadow-lg" />
        <h2 className="text-3xl font-bold text-white text-center">
          Shield
        </h2>
        <p className="text-zinc-300 text-lg text-center max-w-md">
          Shield enables you to protect your content from lawsuits and copyright claims with our team of lawyers.
        </p>
        <button
          disabled
          className="mt-6 px-8 py-3 rounded-lg bg-[#a855f7] text-white font-semibold text-lg opacity-60 cursor-not-allowed transition-all duration-200 hover:opacity-80 hover:scale-105"
        >
          Coming Soon
        </button>
      </div>
    </div>
  );
}