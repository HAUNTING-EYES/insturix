"use client";

import ProjectDashboard from "@/components/editron/project/project-dashboard";
import { PipelineBreadcrumb } from "@/components/dashboard/shared/PipelineBreadcrumb";

export default function EditronDashboard() {
  return (
    <>
      <PipelineBreadcrumb currentStep="edit" />
      <ProjectDashboard />
    </>
  );
}
