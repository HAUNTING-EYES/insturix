import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upgrade Your Plan",
  description: "Choose the perfect plan for your needs. Upgrade to unlock premium features and advanced capabilities.",
};

export default function UpgradeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}