import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ResourcesLibrary } from "@/components/shared/resources/resources-library";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resources | Insturix",
  description: "Blog, FAQ, support, and tutorials.",
};

export default function Resources() {
  return (
    <>
      <SiteNavbar />
      <ResourcesLibrary />
      <SiteFooter />
    </>
  );
}
