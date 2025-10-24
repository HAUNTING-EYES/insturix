"use client";

import Link from "next/link";

export default function Sponsors() {
  return (
    <div className="text-center">
      <div className="mb-6">
        <div className="text-2xl font-semibold text-white animate-pulse drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] tracking-wide">
          Revealing Soon
        </div>
      </div>
      <div className="max-w-md mx-auto">
        <p className="text-base text-zinc-400 mb-4 leading-relaxed">
          Powered by brands building India's creator ecosystem
        </p>
        <Link href="/sponsor" className="inline-flex items-center gap-2 text-[#3A9EFF] hover:text-[#2a8be6] font-medium transition-colors duration-200 group">
          <span>Become a Partner</span>
          <span className="text-sm group-hover:translate-x-1 transition-transform duration-200">→</span>
        </Link>
      </div>
    </div>
  );
}
