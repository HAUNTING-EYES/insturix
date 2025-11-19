"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactVideoEditor from "@/components/editor/version-7.0.0/react-video-editor";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

interface ProjectPageProps {
  params: {
    projectId: string;
  };
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = params;
  const router = useRouter();
  const [projectExists, setProjectExists] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // Check if project exists
  useEffect(() => {
    const checkProject = async () => {
      try {
        const response = await fetch(`/api/services/editron/projects/${projectId}`);
        if (response.ok) {
          setProjectExists(true);
        } else if (response.status === 404) {
          setProjectExists(false);
        } else {
          setProjectExists(false);
        }
      } catch (error) {
        console.error("Error checking project:", error);
        setProjectExists(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkProject();
  }, [projectId]);

  // Loading state
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  // Project not found
  if (projectExists === false) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-6 max-w-md px-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Project Not Found</h1>
            <p className="text-muted-foreground">
              The project you're looking for doesn't exist or you don't have access to it.
            </p>
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

  // Project exists - render editor
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
