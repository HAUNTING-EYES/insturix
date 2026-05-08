"use client";

import { SiteNavbar } from "@/components/shared/site-navbar";
import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <SiteNavbar />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "calc(100vh - 64px)", padding: "64px 24px 48px",
      }}>
        <SignUp routing="hash" forceRedirectUrl="/dashboard" signInUrl="/signin" />
      </div>
    </div>
  );
}
