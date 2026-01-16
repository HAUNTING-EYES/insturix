import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RtdbProvider } from "./RtdbProvider";

export default function ServiceProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Musitron should NOT load RTDB
  const isMusitron = pathname.startsWith("/dashboard/musitron");

  if (isMusitron) {
    return <>{children}</>;
  }

  return <RtdbProvider>{children}</RtdbProvider>;
}
