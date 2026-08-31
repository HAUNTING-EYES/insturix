"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import ReactVideoEditor from "@/components/editron/editor/version-7.0.0/react-video-editor";
import { useProjectLoadGuard } from "@/components/editron/project/use-project-load-guard";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

interface ProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = use(params);
  const router = useRouter();
  const projectLoad = useProjectLoadGuard(projectId);

  if (projectLoad.status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-6 max-w-md px-4">
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
            <p className="text-sm text-muted-foreground font-mono bg-muted px-3 py-1 rounded">
              Project ID: {projectId}
            </p>
          </div>
          <Button
            onClick={() => router.push("/")}
            size="lg"
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Go Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "350px",
        } as React.CSSProperties
      }
    >
      <ReactVideoEditor projectId={projectId} />
    </SidebarProvider>
  );
}
