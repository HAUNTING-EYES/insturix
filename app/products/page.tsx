import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ProductsPage } from "@/components/shared/products/products-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Automated Content Production Studio | Insturix",
  description:
    "Explore the Insturix production studio for planning, scripting, editing, analysis, visual assets, sound, publishing, and brand-consistent content workflows.",
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Automated Content Production Studio | Insturix",
    description:
      "Move from content idea to finished output with one automated production workflow.",
    url: "/products",
  },
};

export default function Products() {
  return (
    <>
      <SiteNavbar />
      <ProductsPage />
      <SiteFooter />
    </>
  );
}
