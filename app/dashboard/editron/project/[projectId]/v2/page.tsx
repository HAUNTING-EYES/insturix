"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactVideoEditor from "@/components/editron/editor/version-7.0.0/react-video-editor";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

/* Editron editor — /v2 PREVIEW route. Same boot guard as the live editor page,
   but mounts ReactVideoEditor with variant="v2" (the redesigned shell over the
   identical provider stack). The live route (../page.tsx) is untouched; swap the
   v2 shell in there once approved. */

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default function ProjectV2PreviewPage({ params }: ProjectPageProps) {
  const { projectId } = use(params);
  const router = useRouter();
  const [projectExists, setProjectExists] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkProject = async (retries = 2) => {
      try {
        const response = await fetch(`/api/services/editron/projects/${projectId}`);
        if (response.ok) {
          setProjectExists(true);
        } else if (response.status === 404) {
          setProjectExists(false);
        } else if (retries > 0) {
          console.warn(`[Project] Check returned ${response.status}, retrying...`);
          await new Promise((r) => setTimeout(r, 1000));
          return checkProject(retries - 1);
        } else {
          setProjectExists(false);
        }
      } catch (error) {
        console.error("Error checking project:", error);
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 1000));
          return checkProject(retries - 1);
        }
        setProjectExists(false);
      } finally {
        if (retries === 0 || !retries) setIsChecking(false);
      }
      setIsChecking(false);
    };

    checkProject();
  }, [projectId]);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  if (projectExists === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md space-y-6 px-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Project Not Found</h1>
            <p className="text-muted-foreground">
              The project you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
            </p>
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
