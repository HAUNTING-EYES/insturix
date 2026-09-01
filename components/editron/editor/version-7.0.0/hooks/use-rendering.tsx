import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompositionProps } from "../types";
import {
  getProgress as ssrGetProgress,
  renderVideo as ssrRenderVideo,
} from "../ssr-helpers/api";
import {
  getProgress as lambdaGetProgress,
  renderVideo as lambdaRenderVideo,
} from "../lambda-helpers/api";
import type { LambdaProgressResponse } from "../lambda-helpers/api";
import { getUserFriendlyErrorMessage } from "@/lib/editron/utils/error-handling";
import type {
  RenderDeliveryManifest,
  RenderMusicDeliveryMode,
} from "@/lib/editron/services/render-delivery-manifest";

// Define possible states for the rendering process
export type State =
  | { status: "init" } // Initial state
  | { status: "invoking" } // API call is being made
  | {
      // Video is being rendered
      renderId: string;
      progress: number;
      status: "rendering";
      bucketName?: string; // Make bucketName optional
      region?: string;
      deliveryManifest?: RenderDeliveryManifest;
    }
  | {
      // Error occurred during rendering
      renderId: string | null;
      status: "error";
      error: Error;
    }
  | {
      // Rendering completed successfully
      url: string;
      size: number;
      status: "done";
      deliveryManifest?: RenderDeliveryManifest;
    };

// Utility function to create a delay
const wait = async (milliSeconds: number) => {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, milliSeconds);
  });
};

type RenderType = "ssr" | "lambda";

async function getRenderProgress(
  renderType: RenderType,
  input: { id: string; bucketName: string; region?: string },
): Promise<LambdaProgressResponse> {
  return renderType === "lambda"
    ? lambdaGetProgress(input)
    : ssrGetProgress(input);
}

type ActiveRenderRecord = {
  projectId?: string;
  renderId?: string;
  status?: string;
  bucketName?: string;
  region?: string;
};

type RenderResumeClaim = {
  renderId: string;
  bucketName?: string;
  region?: string;
  createdAt: number;
};

const RENDER_RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function getRenderResumeStorageKey(projectId: string) {
  return `editron:render-resume:${projectId}`;
}

function readRenderResumeClaim(projectId: string): RenderResumeClaim | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(getRenderResumeStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RenderResumeClaim>;
    if (typeof parsed.renderId !== "string" || !parsed.renderId.trim()) {
      return null;
    }
    if (
      typeof parsed.createdAt !== "number"
      || !Number.isFinite(parsed.createdAt)
      || parsed.createdAt < 0
    ) {
      return null;
    }
    return {
      renderId: parsed.renderId,
      bucketName: typeof parsed.bucketName === "string" ? parsed.bucketName : undefined,
      region: typeof parsed.region === "string" ? parsed.region : undefined,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

function writeRenderResumeClaim(
  projectId: string | undefined,
  renderId: string,
  bucketName?: string,
  region?: string,
) {
  if (!projectId || typeof window === "undefined") return;

  try {
    const claim: RenderResumeClaim = {
      renderId,
      bucketName,
      region,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(
      getRenderResumeStorageKey(projectId),
      JSON.stringify(claim),
    );
  } catch {
    // Resume is best-effort only. Never block rendering if storage is unavailable.
  }
}

function clearRenderResumeClaim(projectId?: string) {
  if (!projectId || typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(getRenderResumeStorageKey(projectId));
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function shouldResumeActiveRender(
  activeRender: ActiveRenderRecord | null | undefined,
  claim: RenderResumeClaim | null,
  projectId: string,
  now = Date.now(),
) {
  if (!activeRender || !claim) return false;
  if (activeRender.projectId !== projectId) return false;
  if (activeRender.status !== "rendering") return false;
  if (activeRender.renderId !== claim.renderId) return false;
  if (claim.bucketName && activeRender.bucketName !== claim.bucketName) return false;
  if (claim.region && activeRender.region !== claim.region) return false;
  if (!Number.isFinite(claim.createdAt) || claim.createdAt < 0 || claim.createdAt > now) return false;
  if (now - claim.createdAt > RENDER_RESUME_MAX_AGE_MS) return false;
  return true;
}

// Custom hook to manage video rendering process
export const useRendering = (
  id: string,
  inputProps: z.infer<typeof CompositionProps>,
  renderType: RenderType = "ssr", // Default to SSR rendering
  projectId?: string // Optional projectId for resume-on-refresh
) => {
  // Maintain current state of the rendering process
  const [state, setState] = useState<State>({
    status: "init",
  });
  const cancelledRef = useRef(false);

  // Check for active renders on mount (resume-on-refresh)
  useEffect(() => {
    if (renderType !== "lambda" || !projectId) return;

    const checkActiveRender = async () => {
      try {
        const resumeClaim = readRenderResumeClaim(projectId);
        if (!resumeClaim) return;

        const response = await fetch(
          `/api/services/editron/render/active?projectId=${encodeURIComponent(projectId)}`,
        );
        const json = await response.json();
        
        if (json.type === "success" && json.data?.renders?.length > 0) {
          // Find render for this project
          const activeRender = json.data.renders.find(
            (r: any) => r.projectId === projectId && r.status === "rendering"
          );
          
          if (shouldResumeActiveRender(activeRender, resumeClaim, projectId)) {

            setState({
              status: "rendering",
              progress: activeRender.progress || 0,
              renderId: activeRender.renderId,
              bucketName: activeRender.bucketName,
              region: activeRender.region,
            });
            // Start polling loop
            pollProgress(
              activeRender.renderId,
              activeRender.bucketName || "",
              activeRender.region ?? resumeClaim.region,
            );
          } else {
            clearRenderResumeClaim(projectId);
          }
        }
      } catch (err) {
        console.error("Error checking for active renders:", err);
      }
    };

    const pollProgress = async (renderId: string, bucketName: string, region?: string) => {
      const getProgress = lambdaGetProgress;
      let pending = true;
      
      while (pending) {
        try {
          const result = await getProgress({ id: renderId, bucketName, region });
          
          switch (result.type) {
            case "error":
              clearRenderResumeClaim(projectId);
              setState({
                status: "error",
                renderId,
                error: new Error(result.message),
              });
              pending = false;
              break;
            case "done":
              clearRenderResumeClaim(projectId);
              setState({
                size: result.size,
                url: result.url,
                status: "done",
                deliveryManifest: result.deliveryManifest,
              });
              pending = false;
              break;
            case "progress":
              setState({
                status: "rendering",
                progress: result.progress,
                renderId,
                bucketName,
                region,
                deliveryManifest: result.deliveryManifest,
              });
              await wait(3000);
          }
        } catch (err) {
          console.error("Error polling progress:", err);
          clearRenderResumeClaim(projectId);
          pending = false;
        }
      }
    };

    checkActiveRender();
  }, [renderType, projectId]);

  // Main function to handle the rendering process
  const renderMedia = useCallback(async (
    musicDeliveryMode: RenderMusicDeliveryMode = "embedded",
  ) => {

    cancelledRef.current = false;
    setState({
      status: "invoking",
    });
    try {
      const lambdaResponse = renderType === "lambda"
        ? await lambdaRenderVideo({
            id,
            inputProps,
            projectId,
            musicDeliveryMode,
          })
        : null;
      const response = lambdaResponse ?? await ssrRenderVideo({ id, inputProps });
      const renderId = response.renderId;
      const bucketName =
        "bucketName" in response ? response.bucketName : undefined;
      const normalizedBucketName =
        typeof bucketName === "string" ? bucketName : undefined;
      const normalizedRegion =
        typeof lambdaResponse?.region === "string" ? lambdaResponse.region : undefined;
      const initialDeliveryManifest = lambdaResponse?.deliveryManifest;

      // Check if render is already complete (synchronous Cloud Run)
      if ("publicUrl" in response && response.publicUrl) {

        clearRenderResumeClaim(projectId);
        setState({
          status: "done",
          url: response.publicUrl as string,
          size: (response as any).size || 0,
          deliveryManifest: initialDeliveryManifest,
        });
        return;
      }

      if (renderType === "ssr") {
        // Add a small delay for SSR rendering to ensure initialization
        await wait(3000);
      }

      setState({
        status: "rendering",
        progress: 0,
        renderId,
        bucketName: normalizedBucketName,
        region: normalizedRegion,
        deliveryManifest: initialDeliveryManifest,
      });
      writeRenderResumeClaim(
        projectId,
        renderId,
        normalizedBucketName,
        normalizedRegion,
      );

      let pending = true;

      while (pending) {
        // Check if cancelled
        if (cancelledRef.current) {
          console.log('[Render] Cancelled by user');
          clearRenderResumeClaim(projectId);
          setState({ status: "init" });
          pending = false;
          break;
        }

        const result = await getRenderProgress(renderType, {
          id: renderId,
          bucketName: normalizedBucketName ?? "",
          region: normalizedRegion,
        });

        switch (result.type) {
          case "error": {
            console.error(`Render error: ${result.message}`);
            clearRenderResumeClaim(projectId);
            setState({
              status: "error",
              renderId: renderId,
              error: new Error(getUserFriendlyErrorMessage(result.message)),
            });
            pending = false;
            break;
          }
          case "done": {
            console.log(
              `Render complete: url=${result.url}, size=${result.size}`
            );
            clearRenderResumeClaim(projectId);
            setState({
              size: result.size,
              url: result.url,
              status: "done",
              deliveryManifest:
                result.deliveryManifest ?? initialDeliveryManifest,
            });
            pending = false;
            break;
          }
          case "progress": {

            setState({
              status: "rendering",
              progress: result.progress,
              renderId: renderId,
              bucketName: normalizedBucketName,
              region: normalizedRegion,
              deliveryManifest:
                result.deliveryManifest ?? initialDeliveryManifest,
            });
            await wait(3000); // Poll every 3 seconds to avoid rate limits
          }
        }
      }
    } catch (err) {
      console.error("Unexpected error during rendering:", err);
      clearRenderResumeClaim(projectId);
      setState({
        status: "error",
        error: new Error(getUserFriendlyErrorMessage(err)),
        renderId: null,
      });
    }
  }, [id, inputProps, renderType, projectId]);

  // Reset the rendering state back to initial
  const undo = useCallback(() => {
    clearRenderResumeClaim(projectId);
    setState({ status: "init" });
  }, [projectId]);

  // Cancel an in-progress render
  const cancelRender = useCallback(() => {
    cancelledRef.current = true;
    clearRenderResumeClaim(projectId);
    setState({ status: "init" });
  }, [projectId]);

  // Return memoized values to prevent unnecessary re-renders
  return useMemo(
    () => ({
      renderMedia, // Function to start rendering
      state, // Current state of the render
      undo, // Function to reset the state
      cancelRender, // Function to cancel in-progress render
    }),
    [renderMedia, state, undo, cancelRender]
  );
};
