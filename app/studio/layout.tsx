import type { Metadata } from "next";
import "./studio.css";

export const metadata: Metadata = {
  title: "Insturix — Studio",
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
