"use client";

import Navbar from "@/components/Navbar";
import CustomSignup from "@/components/CustomSignup";
// import CustomSignup from "@/components/CustomSignup_Backup";
import CursorEffect from "@/components/ui/CursorEffect";
import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full">
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 .5H32M.5 0V32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
      </div>
      <div className="relative z-10">
        <CursorEffect
          variant="glow"
          color="rgba(59, 130, 246, 0.15)"
          size={500}
          blur={100}
        />
        <Navbar />
      </div>
      <div className="flex items-center justify-center min-h-[calc(100vh-70px)] md:min-h-[calc(100vh-90px)] w-full px-4 pt-[70px] md:pt-[90px]">
        <CustomSignup />
        {/* <SignUp
          routing="hash"
          forceRedirectUrl="/dashboard"
        /> */}
      </div>
    </div>
  );
}
