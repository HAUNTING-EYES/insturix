import { ComingSoon } from "@/components/ComingSoon";
import React, { Suspense } from "react";
import { UniversalLoader } from "@/components/Loader/UniversalLoader";

export const revalidate = 60;

export default function Dashboard() {
  return (
    <Suspense fallback={<UniversalLoader />}>
      <ComingSoon serviceName="ThinkForge" />
    </Suspense>
  );
}
