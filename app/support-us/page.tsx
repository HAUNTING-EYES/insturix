import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { SupportCredits } from "@/components/shared/support-us/support-credits";
import type { Metadata } from "next";

// This route is in the sitemap but declared no metadata at all, so it inherited the
// root layout's and served the HOMEPAGE's title and description in search results.
export const metadata: Metadata = {
  alternates: { canonical: "/support-us" },
  title: "Support Us",
  description:
    "Support Insturix and help us keep building an automated content production platform for agencies, in-house teams, creator houses, and filmmakers.",
};

export default function SupportUs() {
  return (
    <>
      <SiteNavbar />
      <SupportCredits />
      <SiteFooter />
    </>
  );
}
