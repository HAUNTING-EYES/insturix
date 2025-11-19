"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactVideoEditor from "@/components/editron/editor/version-7.0.0/react-video-editor";
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
          console.error("Failed to check project:", response.status);
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
      <div className="fixed inset-0 lg:left-16 flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading project...</p>
        </div>
      </div>
    );
  }

  // Project not found
  if (!projectExists) {
    return (
      <div className="fixed inset-0 lg:left-16 flex items-center justify-center bg-zinc-950">
        <div className="max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <h2 className="text-xl font-semibold text-white">
              Project Not Found
            </h2>
          </div>
          <p className="text-zinc-400 mb-6">
            The project you're looking for doesn't exist or has been deleted.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => router.push("/dashboard/editron")}
              className="flex-1"
            >
              <Home className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Project exists - render full-screen editor
  return (
    <div className="fixed inset-0 lg:left-16 bg-zinc-950">
      <ReactVideoEditor projectId={projectId} />
    </div>
  );
}
