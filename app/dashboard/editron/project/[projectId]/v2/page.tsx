"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import ReactVideoEditor from "@/components/editron/editor/version-7.0.0/react-video-editor";
import { useProjectLoadGuard } from "@/components/editron/project/use-project-load-guard";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

/* Editron editor — /v2 PREVIEW route. Uses the same source-integrity boot guard
   as the live editor, then mounts the redesigned shell over the identical
   provider stack. */

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default function ProjectV2PreviewPage({ params }: ProjectPageProps) {
  const { projectId } = use(params);
  const router = useRouter();
  const projectLoad = useProjectLoadGuard(projectId);

  if (projectLoad.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  if (projectLoad.status !== "ready") {
    const title = projectLoad.status === "missing"
      ? "Project Not Found"
      : projectLoad.status === "blocked"
        ? "Project media needs attention"
        : "Unable to open project";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md space-y-6 px-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-muted-foreground">
              {projectLoad.message}
            </p>
            {projectLoad.status === "blocked" && projectLoad.reason && (
              <p className="rounded bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
                Safe stop: {projectLoad.reason}
              </p>
            )}
            <p className="rounded bg-muted px-3 py-1 font-mono text-sm text-muted-foreground">Project ID: {projectId}</p>
          </div>
          <Button onClick={() => router.push("/")} size="lg" className="gap-2">
            <Home className="h-4 w-4" />
            Go Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "350px" } as React.CSSProperties}>
      <ReactVideoEditor projectId={projectId} variant="v2" />
    </SidebarProvider>
  );
}
