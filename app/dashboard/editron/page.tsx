"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import ProjectDashboard from "@/components/editron/project/project-dashboard";
import { PipelineBreadcrumb } from "@/components/dashboard/shared/PipelineBreadcrumb";
import { Button } from "@/components/ui/button";

export default function EditronDashboard() {
  return (
    <>
      <PipelineBreadcrumb currentStep="edit" />
      <div className="mx-auto flex w-full max-w-6xl justify-end px-4 pt-4">
        <Button asChild className="gap-2 rounded-md bg-[#D4A652] text-[#11100e] hover:bg-[#e4bb70]">
          <Link href="/dashboard/editron/saas-explainer">
            <Sparkles className="h-4 w-4" />
            SaaS Explainer
          </Link>
        </Button>
      </div>
      <ProjectDashboard />
    </>
  );
}
