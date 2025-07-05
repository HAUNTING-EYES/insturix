// import CustomSignup from "@/components/CustomSignup";
import { SignUp } from "@clerk/nextjs";
import Navbar from "@/components/Navbar";
import CursorEffect from "@/components/ui/CursorEffect";

export default function SignupPage() {
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
        {/* <CustomSignup /> */}
        <SignUp routing="hash" forceRedirectUrl={"/dashboard"} signInUrl="/signin"/>
      </div>
    </div>
  );
}
