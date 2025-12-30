"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";
import UniversalLoader from "@/components/Loader/UniversalLoader";

const ClientMotionWrapper = dynamic(
  () => import("@/components/MotionWrapper"),
  { 
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center min-h-[70vh]">
        <UniversalLoader />
      </div>
    ),
  }
);

export default function ProductPageWrapper({ children }: { children: ReactNode }) {
  return <ClientMotionWrapper>{children}</ClientMotionWrapper>;
} 