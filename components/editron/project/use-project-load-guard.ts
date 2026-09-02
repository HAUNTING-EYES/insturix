"use client";

import { useEffect, useState } from "react";

type ProjectLoadFailurePayload = Readonly<{
  code?: unknown;
  details?: Readonly<{ reason?: unknown }>;
  error?: unknown;
}>;

export type ProjectLoadGuardState = Readonly<
  | { status: "loading" }
  | { status: "ready" }
  | { status: "missing"; message: string }
  | { status: "blocked"; message: string; reason: string | null }
  | { status: "error"; message: string }
>;

type ProjectLoadResponseDisposition = ProjectLoadGuardState | Readonly<{
  status: "retryable";
  message: string;
}>;

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

export function classifyProjectLoadResponse(
  status: number,
  payload: ProjectLoadFailurePayload | null,
): ProjectLoadResponseDisposition {
  if (status >= 200 && status < 300) return { status: "ready" };
  if (status === 404) {
    return {
      status: "missing",
      message: "The project does not exist or you do not have access to it.",
    };
  }
  if (status === 409 && payload?.code === "PROJECT_VIDEO_SOURCE_UNVERIFIABLE") {
    return {
      status: "blocked",
      message: typeof payload.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : "The selected project media could not be verified. No substitute media was loaded.",
      reason: typeof payload.details?.reason === "string"
        ? payload.details.reason
        : null,
    };
  }
  if (TRANSIENT_STATUSES.has(status)) {
    return {
      status: "retryable",
      message: "The project service is temporarily unavailable.",
    };
  }
  return {
    status: "error",
    message: typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : "The project could not be loaded.",
  };
}

export function useProjectLoadGuard(
  projectId: string,
  maxRetries = 2,
): ProjectLoadGuardState {
  const [state, setState] = useState<ProjectLoadGuardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async (retriesRemaining: number): Promise<void> => {
      try {
        const response = await fetch(
          `/api/services/editron/projects/${encodeURIComponent(projectId)}`,
          { signal: controller.signal },
        );
        const payload = await response.json().catch(() => null) as ProjectLoadFailurePayload | null;
        const disposition = classifyProjectLoadResponse(response.status, payload);
        if (disposition.status === "retryable" && retriesRemaining > 0) {
          await wait(1_000);
          if (!cancelled) await load(retriesRemaining - 1);
          return;
        }
        if (cancelled) return;
        setState(disposition.status === "retryable"
          ? { status: "error", message: disposition.message }
          : disposition);
      } catch (error) {
        if (cancelled || isAbortError(error)) return;
        if (retriesRemaining > 0) {
          await wait(1_000);
          if (!cancelled) await load(retriesRemaining - 1);
          return;
        }
        setState({
          status: "error",
          message: "The project could not be loaded because the service could not be reached.",
        });
      }
    };

    setState({ status: "loading" });
    void load(Math.max(0, Math.trunc(maxRetries)));
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [maxRetries, projectId]);

  return state;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
