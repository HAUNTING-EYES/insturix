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
import { getUserFriendlyErrorMessage } from "@/lib/editron/utils/error-handling";

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
        const response = await fetch("/api/services/editron/render/active");
        const json = await response.json();
        
        if (json.type === "success" && json.data?.renders?.length > 0) {
          // Find render for this project
          const activeRender = json.data.renders.find(
            (r: any) => r.projectId === projectId && r.status === "rendering"
          );
          
          if (activeRender) {

            setState({
              status: "rendering",
              progress: activeRender.progress || 0,
              renderId: activeRender.renderId,
              bucketName: activeRender.bucketName,
            });
            // Start polling loop
            pollProgress(activeRender.renderId, activeRender.bucketName || "");
          }
        }
      } catch (err) {
        console.error("Error checking for active renders:", err);
      }
    };

    const pollProgress = async (renderId: string, bucketName: string) => {
      const getProgress = lambdaGetProgress;
      let pending = true;
      
      while (pending) {
        try {
          const result = await getProgress({ id: renderId, bucketName });
          
          switch (result.type) {
            case "error":
              setState({
                status: "error",
                renderId,
                error: new Error(result.message),
              });
              pending = false;
              break;
            case "done":
              setState({
                size: result.size,
                url: result.url,
                status: "done",
              });
              pending = false;
              break;
            case "progress":
              setState({
                status: "rendering",
                progress: result.progress,
                renderId,
                bucketName,
              });
              await wait(3000);
          }
        } catch (err) {
          console.error("Error polling progress:", err);
          pending = false;
        }
      }
    };

    checkActiveRender();
  }, [renderType, projectId]);

  // Main function to handle the rendering process
  const renderMedia = useCallback(async () => {

    cancelledRef.current = false;
    setState({
      status: "invoking",
    });
    try {
      const renderVideo =
        renderType === "ssr" ? ssrRenderVideo : lambdaRenderVideo;
      const getProgress =
        renderType === "ssr" ? ssrGetProgress : lambdaGetProgress;


      const response = await renderVideo({ id, inputProps, projectId });
      const renderId = response.renderId;
      const bucketName =
        "bucketName" in response ? response.bucketName : undefined;

      // Check if render is already complete (synchronous Cloud Run)
      if ("publicUrl" in response && response.publicUrl) {

        setState({
          status: "done",
          url: response.publicUrl as string,
          size: (response as any).size || 0,
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
        bucketName: typeof bucketName === "string" ? bucketName : undefined,
      });

      let pending = true;

      while (pending) {
        // Check if cancelled
        if (cancelledRef.current) {
          console.log('[Render] Cancelled by user');
          setState({ status: "init" });
          pending = false;
          break;
        }

        const result = await getProgress({
          id: renderId,
          bucketName: typeof bucketName === "string" ? bucketName : "",
        });

        switch (result.type) {
          case "error": {
            console.error(`Render error: ${result.message}`);
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
            setState({
              size: result.size,
              url: result.url,
              status: "done",
            });
            pending = false;
            break;
          }
          case "progress": {

            setState({
              status: "rendering",
              progress: result.progress,
              renderId: renderId,
            });
            await wait(3000); // Poll every 3 seconds to avoid rate limits
          }
        }
      }
    } catch (err) {
      console.error("Unexpected error during rendering:", err);
      setState({
        status: "error",
        error: new Error(getUserFriendlyErrorMessage(err)),
        renderId: null,
      });
    }
  }, [id, inputProps, renderType, projectId]);

  // Reset the rendering state back to initial
  const undo = useCallback(() => {
    setState({ status: "init" });
  }, []);

  // Cancel an in-progress render
  const cancelRender = useCallback(() => {
    cancelledRef.current = true;
    setState({ status: "init" });
  }, []);

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
