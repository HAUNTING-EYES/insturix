import { z } from "zod";
import type { RenderMediaOnLambdaOutput } from "@remotion/lambda/client";

import { CompositionProps } from "@/components/editron/editor/version-7.0.0/types";
import { buildCompactProjectRenderInputProps } from "@/lib/editron/shared/render-request-payload";
import type {
  RenderDeliveryManifest,
  RenderMusicDeliveryMode,
} from "@/lib/editron/services/render-delivery-manifest";

export type LambdaRenderResponse = RenderMediaOnLambdaOutput & {
  deliveryManifest?: RenderDeliveryManifest;
  region?: string;
};

export type LambdaProgressResponse =
  | { type: "error"; message: string }
  | {
      type: "progress";
      progress: number;
      deliveryManifest?: RenderDeliveryManifest;
    }
  | {
      type: "done";
      url: string;
      size: number;
      deliveryManifest?: RenderDeliveryManifest;
    };

type ApiResponse<T> = {
  type: "success" | "error";
  data?: T;
  message?: string;
};

const makeRequest = async <Res>(
  endpoint: string,
  body: unknown
): Promise<Res> => {

  const result = await fetch(endpoint, {
    method: "post",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
  const text = await result.text();
  let json: ApiResponse<Res> | null = null;

  if (text.trim()) {
    try {
      json = JSON.parse(text) as ApiResponse<Res>;
    } catch {
      const snippet = text.slice(0, 240);
      throw new Error(
        `Request to ${endpoint} failed with ${result.status} ${result.statusText || "response"}: ${snippet}`
      );
    }
  }

  if (!result.ok) {
    throw new Error(
      json?.message ||
        `Request to ${endpoint} failed with ${result.status} ${result.statusText || "response"}`
    );
  }

  if (!json) {
    throw new Error(`Empty response received from ${endpoint}`);
  }

  if (json.type === "error") {
    console.error(`Error in response from ${endpoint}:`, json.message);
    throw new Error(json.message);
  }

  if (!json.data) {
    throw new Error(`No data received from ${endpoint}`);
  }

  return json.data;
};

export const renderVideo = async ({
  id,
  inputProps,
  projectId,
  musicDeliveryMode = "embedded",
}: {
  id: string;
  inputProps: z.infer<typeof CompositionProps>;
  projectId?: string;
  musicDeliveryMode?: RenderMusicDeliveryMode;
}) => {

  const body = {
    id,
    inputProps: projectId
      ? buildCompactProjectRenderInputProps(inputProps)
      : inputProps,
    projectId,
    musicDeliveryMode,
  };

  const response = await makeRequest<LambdaRenderResponse>(
    "/api/services/editron/cloudrun/render",
    body
  );

  return response;
};

export const getProgress = async ({
  id,
  bucketName,
  region = 'us-east-1',
}: {
  id: string;
  bucketName: string;
  region?: string;
}): Promise<LambdaProgressResponse> => {

  
  const params = new URLSearchParams({
    renderId: id,
    bucketName,
    region,
  });

  const result = await fetch(`/api/services/editron/cloudrun/progress?${params.toString()}`);
  const json = await result.json() as {
    type: string;
    data?: {
      done?: boolean;
      outputFile?: string;
      outputSize?: number;
      progress?: number;
      deliveryManifest?: RenderDeliveryManifest;
    };
    message?: string;
  };
  

  
  if (json.type === "error") {
    return { type: "error", message: json.message || "Unknown error" };
  }

  if (!json.data) {
    return { type: "error", message: "No data received from progress endpoint" };
  }

  const data = json.data;

  if (data.done) {
    if (!data.outputFile) {
      return {
        type: "error",
        message: "Render completed without an output file",
      };
    }
    return {
      type: "done",
      url: data.outputFile,
      size: data.outputSize || 0,
      deliveryManifest: data.deliveryManifest,
    };
  }

  return {
    type: "progress",
    progress: Math.round((data.progress || 0) * 100), // Convert 0-1 to 0-100 and round to avoid decimals
    deliveryManifest: data.deliveryManifest,
  };
};
