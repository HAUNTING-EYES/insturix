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
import type {
  LambdaProgressRequest,
  LambdaProgressResponse,
  LambdaRenderResponse,
} from "../lambda-helpers/api";
import { getUserFriendlyErrorMessage } from "@/lib/editron/utils/error-handling";
import { CHAPTER_ORCHESTRATION_EXECUTION_KIND } from "@/lib/editron/shared/render-request-payload";
import type {
  RenderDeliveryManifest,
  RenderMusicDeliveryMode,
} from "@/lib/editron/services/render-delivery-manifest";

type ChapterExecutionKind = typeof CHAPTER_ORCHESTRATION_EXECUTION_KIND;

// Define possible states for the rendering process
type State =
  | { status: "init" } // Initial state
  | { status: "invoking" } // API call is being made
  | {
      // Video is being rendered
      renderId: string;
      progress: number;
      status: "rendering";
      executionKind?: ChapterExecutionKind;
      orchestrationId?: string;
      bucketName?: string;
      region?: string;
      deliveryManifest?: RenderDeliveryManifest;
    }
  | {
      // Error occurred during rendering
      renderId: string | null;
      status: "error";
      error: Error;
      executionKind?: ChapterExecutionKind;
      orchestrationId?: string;
      bucketName?: string;
      region?: string;
    }
  | {
      // Rendering completed successfully
      url: string;
      size: number;
      status: "done";
      deliveryManifest?: RenderDeliveryManifest;
      executionKind?: ChapterExecutionKind;
      orchestrationId?: string;
      bucketName?: string;
      region?: string;
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
  input: LambdaProgressRequest,
): Promise<LambdaProgressResponse> {
  if (renderType === "lambda") return lambdaGetProgress(input);
  if (input.executionKind !== undefined) {
    throw new Error("Chapter orchestration progress requires Lambda rendering");
  }
  return ssrGetProgress({
    id: input.renderId,
    bucketName: input.bucketName,
  });
}

type RenderPollingIdentity =
  | {
      renderId: string;
      bucketName: string;
      region?: string;
      executionKind?: never;
      orchestrationId?: never;
    }
  | {
      executionKind: ChapterExecutionKind;
      orchestrationId: string;
      renderId: string;
      region: string;
      bucketName?: never;
    };

export type ActiveRenderRecord = {
  projectId?: string;
  renderId?: string;
  status?: string;
  bucketName?: string;
  region?: string;
  executionKind?: unknown;
  orchestrationId?: unknown;
  progress?: number;
};

export type RenderResumeClaim =
  | {
      renderId: string;
      bucketName?: string;
      region?: string;
      executionKind?: never;
      orchestrationId?: never;
      createdAt: number;
    }
  | {
      executionKind: ChapterExecutionKind;
      orchestrationId: string;
      renderId: string;
      region: string;
      bucketName?: never;
      createdAt: number;
    };

type RenderResumeIdentity =
  | {
      renderId: string;
      bucketName?: string;
      region?: string;
      executionKind?: never;
      orchestrationId?: never;
    }
  | {
      executionKind: ChapterExecutionKind;
      orchestrationId: string;
      renderId: string;
      region: string;
      bucketName?: never;
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
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const renderId = nonEmptyString(parsed.renderId);
    if (!renderId) {
      return null;
    }
    if (
      typeof parsed.createdAt !== "number"
      || !Number.isFinite(parsed.createdAt)
      || parsed.createdAt < 0
    ) {
      return null;
    }

    if (parsed.executionKind !== undefined) {
      const orchestrationId = nonEmptyString(parsed.orchestrationId);
      const region = nonEmptyString(parsed.region);
      if (
        parsed.executionKind !== CHAPTER_ORCHESTRATION_EXECUTION_KIND
        || !orchestrationId
        || !region
        || parsed.bucketName !== undefined
      ) {
        return null;
      }
      return {
        executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
        orchestrationId,
        renderId,
        region,
        createdAt: parsed.createdAt,
      };
    }
    if (parsed.orchestrationId !== undefined) return null;

    return {
      renderId,
      ...(typeof parsed.bucketName === "string"
        ? { bucketName: parsed.bucketName }
        : {}),
      ...(typeof parsed.region === "string" ? { region: parsed.region } : {}),
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

function writeRenderResumeClaim(
  projectId: string | undefined,
  identity: RenderResumeIdentity,
) {
  if (!projectId || typeof window === "undefined") return;

  try {
    const claim: RenderResumeClaim = identity.executionKind === CHAPTER_ORCHESTRATION_EXECUTION_KIND
      ? {
          executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
          orchestrationId: identity.orchestrationId,
          renderId: identity.renderId,
          region: identity.region,
          createdAt: Date.now(),
        }
      : {
          renderId: identity.renderId,
          ...(identity.bucketName !== undefined
            ? { bucketName: identity.bucketName }
            : {}),
          ...(identity.region !== undefined ? { region: identity.region } : {}),
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
  const activeRenderId = nonEmptyString(activeRender.renderId);
  if (!activeRenderId || activeRenderId !== claim.renderId) return false;
  if (!Number.isFinite(claim.createdAt) || claim.createdAt < 0 || claim.createdAt > now) return false;
  if (now - claim.createdAt > RENDER_RESUME_MAX_AGE_MS) return false;

  if (claim.executionKind === CHAPTER_ORCHESTRATION_EXECUTION_KIND) {
    return activeRender.executionKind === CHAPTER_ORCHESTRATION_EXECUTION_KIND
      && nonEmptyString(activeRender.orchestrationId) === claim.orchestrationId
      && nonEmptyString(activeRender.region) === claim.region
      && claim.bucketName === undefined;
  }

  if (
    claim.orchestrationId !== undefined
    || activeRender.executionKind !== undefined
    || activeRender.orchestrationId !== undefined
    || isLegacyChapterResumeRecord(activeRender)
    || isLegacyChapterResumeClaim(claim)
  ) {
    return false;
  }
  if (claim.bucketName && activeRender.bucketName !== claim.bucketName) return false;
  if (claim.region && activeRender.region !== claim.region) return false;
  return true;
}

function isLegacyChapterResumeRecord(record: ActiveRenderRecord): boolean {
  return record.executionKind === undefined
    && (
      record.bucketName === "chapter-render"
      || nonEmptyString(record.renderId)?.startsWith("chr_") === true
    );
}

function isLegacyChapterResumeClaim(claim: RenderResumeClaim): boolean {
  return claim.executionKind === undefined
    && (
      claim.bucketName === "chapter-render"
      || claim.renderId.startsWith("chr_")
    );
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildStateIdentityFields(identity: RenderPollingIdentity) {
  return identity.executionKind === CHAPTER_ORCHESTRATION_EXECUTION_KIND
    ? {
        executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
        orchestrationId: identity.orchestrationId,
        region: identity.region,
      }
    : {
        ...(identity.bucketName ? { bucketName: identity.bucketName } : {}),
        ...(identity.region ? { region: identity.region } : {}),
      };
}

function buildRenderingState(
  identity: RenderPollingIdentity,
  progress: number,
  deliveryManifest?: RenderDeliveryManifest,
): State {
  return {
    status: "rendering",
    progress,
    renderId: identity.renderId,
    ...buildStateIdentityFields(identity),
    ...(deliveryManifest !== undefined ? { deliveryManifest } : {}),
  };
}

function toProgressRequest(
  identity: RenderPollingIdentity,
): LambdaProgressRequest {
  if (identity.executionKind === CHAPTER_ORCHESTRATION_EXECUTION_KIND) {
    return {
      executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
      orchestrationId: identity.orchestrationId,
      region: identity.region,
    };
  }
  return identity;
}

function resolveRenderPollingIdentity(
  response: LambdaRenderResponse | { renderId: string },
  renderType: RenderType,
): RenderPollingIdentity {
  const record = response as unknown as Record<string, unknown>;
  const renderId = nonEmptyString(record.renderId);
  if (!renderId) throw new Error("Render response is missing renderId");

  if (record.executionKind !== undefined) {
    const orchestrationId = nonEmptyString(record.orchestrationId);
    const region = nonEmptyString(record.region);
    if (
      renderType !== "lambda"
      || record.executionKind !== CHAPTER_ORCHESTRATION_EXECUTION_KIND
      || !orchestrationId
      || !region
      || record.bucketName !== undefined
      || record.isChapterRender !== undefined
    ) {
      throw new Error("Invalid chapter orchestration render response");
    }
    return {
      executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
      orchestrationId,
      renderId,
      region,
    };
  }

  if (
    record.orchestrationId !== undefined
    || record.isChapterRender !== undefined
    || record.bucketName === "chapter-render"
  ) {
    throw new Error("Chapter render response is missing its execution discriminant");
  }

  const bucketName = nonEmptyString(record.bucketName);
  if (renderType === "lambda" && !bucketName) {
    throw new Error("Provider render response is missing bucketName");
  }
  return {
    renderId,
    bucketName: bucketName ?? "",
    region: nonEmptyString(record.region),
  };
}

function buildResumePollingIdentity(
  activeRender: ActiveRenderRecord,
  claim: RenderResumeClaim,
): RenderPollingIdentity {
  if (claim.executionKind === CHAPTER_ORCHESTRATION_EXECUTION_KIND) {
    return {
      executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
      orchestrationId: claim.orchestrationId,
      renderId: claim.renderId,
      region: claim.region,
    };
  }

  const bucketName = nonEmptyString(activeRender.bucketName) ?? claim.bucketName;
  if (!bucketName) throw new Error("Provider resume is missing bucketName");
  return {
    renderId: claim.renderId,
    bucketName,
    region: nonEmptyString(activeRender.region) ?? claim.region,
  };
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
          ) as ActiveRenderRecord | undefined;
          
          if (shouldResumeActiveRender(activeRender, resumeClaim, projectId)) {
            if (!activeRender) return;
            const identity = buildResumePollingIdentity(activeRender, resumeClaim);

            setState(buildRenderingState(identity, activeRender.progress || 0));
            // Start polling loop
            pollProgress(identity);
          } else {
            clearRenderResumeClaim(projectId);
          }
        }
      } catch (err) {
        console.error("Error checking for active renders:", err);
      }
    };

    const pollProgress = async (identity: RenderPollingIdentity) => {
      let pending = true;
      
      while (pending) {
        try {
          const result = await lambdaGetProgress(toProgressRequest(identity));
          
          switch (result.type) {
            case "error":
              clearRenderResumeClaim(projectId);
              setState({
                status: "error",
                renderId: identity.renderId,
                error: new Error(result.message),
                ...buildStateIdentityFields(identity),
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
                ...buildStateIdentityFields(identity),
              });
              pending = false;
              break;
            case "progress":
              setState(buildRenderingState(
                identity,
                result.progress,
                result.deliveryManifest,
              ));
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
    let pollingIdentity: RenderPollingIdentity | undefined;
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
      const initialDeliveryManifest =
        "deliveryManifest" in response
          ? response.deliveryManifest as RenderDeliveryManifest | undefined
          : undefined;

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

      const identity = resolveRenderPollingIdentity(response, renderType);
      pollingIdentity = identity;

      if (renderType === "ssr") {
        // Add a small delay for SSR rendering to ensure initialization
        await wait(3000);
      }

      setState(buildRenderingState(identity, 0, initialDeliveryManifest));
      writeRenderResumeClaim(projectId, identity);

      let pending = true;

      while (pending) {
        // Check if cancelled
        if (cancelledRef.current) {
          clearRenderResumeClaim(projectId);
          setState({ status: "init" });
          pending = false;
          break;
        }

        const result = await getRenderProgress(renderType, toProgressRequest(identity));

        switch (result.type) {
          case "error": {
            console.error(`Render error: ${result.message}`);
            clearRenderResumeClaim(projectId);
            setState({
              status: "error",
              renderId: identity.renderId,
              error: new Error(getUserFriendlyErrorMessage(result.message)),
              ...buildStateIdentityFields(identity),
            });
            pending = false;
            break;
          }
          case "done": {
            clearRenderResumeClaim(projectId);
            setState({
              size: result.size,
              url: result.url,
              status: "done",
              deliveryManifest:
                result.deliveryManifest ?? initialDeliveryManifest,
              ...buildStateIdentityFields(identity),
            });
            pending = false;
            break;
          }
          case "progress": {

            setState(buildRenderingState(
              identity,
              result.progress,
              result.deliveryManifest ?? initialDeliveryManifest,
            ));
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
        renderId: pollingIdentity?.renderId ?? null,
        ...(pollingIdentity ? buildStateIdentityFields(pollingIdentity) : {}),
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
