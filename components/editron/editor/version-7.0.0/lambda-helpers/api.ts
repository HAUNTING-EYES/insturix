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
  console.log(`Making request to ${endpoint}`, { body });
  const result = await fetch(endpoint, {
    method: "post",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
  const json = (await result.json()) as ApiResponse<Res>;
  console.log(`Response received from ${endpoint}`, { json });
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
}: {
  id: string;
  inputProps: z.infer<typeof CompositionProps>;
}) => {
  console.log("Rendering video", { id, inputProps });
  const body: z.infer<typeof RenderRequest> = {
    id,
    inputProps,
  };

  const response = await makeRequest<RenderMediaOnLambdaOutput>(
    "/api/services/editron/cloudrun/render",
    body
  );
  console.log("Video render response", { response });
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
  console.log("Getting progress", { id, bucketName, region });
  
  const params = new URLSearchParams({
    renderId: id,
    bucketName,
    region,
  });

  const result = await fetch(`/api/services/editron/cloudrun/progress?${params.toString()}`);
  const json = await result.json() as { type: string; data?: ProgressResponse; message?: string };
  
  console.log("Progress response", { json });
  
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
    progress: (data.progress || 0) * 100, // Convert 0-1 to 0-100 if needed, or check if hook expects 0-1.
    // Looking at use-rendering.tsx: `console.log(\`Render progress: ${result.progress}%\`);` 
    // It seems to expect percentage. 
    // Lambda client returns 0-1.
  };
};
