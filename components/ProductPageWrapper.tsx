"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

const ClientMotionWrapper = dynamic(
  () => import("@/components/MotionWrapper"),
  { ssr: false }
);

export default function ProductPageWrapper({ children }: { children: ReactNode }) {
  return <ClientMotionWrapper>{children}</ClientMotionWrapper>;
} 