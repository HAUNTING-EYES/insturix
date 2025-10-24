"use client";

// import SignInPage from "@/components/SignIn";
import Navbar from "@/components/Navbar";
import CursorEffect from "@/components/ui/CursorEffect";
import { SignIn as SignInComponent } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

export default function SignIn() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams?.get("redirect_url") || undefined;
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative">
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
        {/* <SignInPage /> */}  
  <SignInComponent routing="hash" forceRedirectUrl={redirectParam} signUpUrl="/signup"/>

      </div>
    </div>
  );
}
