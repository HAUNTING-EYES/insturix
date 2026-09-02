import type { Metadata } from "next";
import "./studio.css";
import { StudioRail } from "@/components/studio/shell/places";

export const metadata: Metadata = {
  title: "Insturix — Studio",
  robots: { index: false, follow: false },
};

/** Four-place shell: the rail persists across every studio place; each place
 *  keeps its own topbar + body (Home, Project, Calendar, Library). */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="stu stu-shellroot">
      <StudioRail />
      <div className="stu-placemain">{children}</div>
    </div>
  );
}
