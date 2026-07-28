import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing & Plans",
  description:
    "Insturix plans and pricing for automated content production. Compare what each plan includes for individual creators, teams, and agencies.",
};

export default function UpgradeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}