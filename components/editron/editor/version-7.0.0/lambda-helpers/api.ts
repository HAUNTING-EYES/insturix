import { z } from "zod";
import type { RenderMediaOnLambdaOutput } from "@remotion/lambda/client";

import {
  RenderRequest,
  ProgressRequest,
  ProgressResponse,
} from "@/components/editron/editor/version-7.0.0/types";
import { CompositionProps } from "@/components/editron/editor/version-7.0.0/types";

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
  const json = (await result.json()) as ApiResponse<Res>;

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
}: {
  id: string;
  inputProps: z.infer<typeof CompositionProps>;
  projectId?: string;
}) => {

  const body = {
    id,
    inputProps,
    projectId,
  };

  const response = await makeRequest<RenderMediaOnLambdaOutput>(
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
}): Promise<ProgressResponse> => {

  
  const params = new URLSearchParams({
    renderId: id,
    bucketName,
    region,
  });

  const result = await fetch(`/api/services/editron/cloudrun/progress?${params.toString()}`);
  const json = await result.json() as { type: string; data?: ProgressResponse; message?: string };
  

  
  if (json.type === "error") {
    return { type: "error", message: json.message || "Unknown error" };
  }

  if (!json.data) {
    return { type: "error", message: "No data received from progress endpoint" };
  }

  const data = json.data as any;

  if (data.done) {
    return {
      type: "done",
      url: data.outputFile,
      size: data.outputSize || 0,
    };
  }

  return {
    type: "progress",
    progress: Math.round((data.progress || 0) * 100), // Convert 0-1 to 0-100 and round to avoid decimals
  };
};
