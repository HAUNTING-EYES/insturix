"use client";

import { SiteNavbar } from "@/components/shared/site-navbar";
import { SignIn as SignInComponent } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

export default function SignIn() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams?.get("redirect_url") || undefined;
  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <SiteNavbar />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "calc(100vh - 64px)", padding: "64px 24px 48px",
      }}>
        <SignInComponent
          path="/signin"
          routing="path"
          forceRedirectUrl={redirectParam}
          signUpUrl="/signup"
        />
      </div>
    </div>
  );
}
