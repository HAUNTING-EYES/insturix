import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insturix — Account",
  robots: { index: false, follow: false },
};

/**
 * Account shell seam (Phase 6, transitional): the vibe surface is for things
 * the agent MAKES; /account is for things you CONFIGURE. Each route resolves
 * to the real management surface until the account shell gets its own skin.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
