import axios from "axios";


export interface LocationData {
  currency: string;
  symbol: string;
}

export const fetchLocationData = async (): Promise<LocationData> => {
  const { data } = await axios.get<LocationData>("/api/location");
  return data;
};

export interface GeneratedMusic {
  id: string;
  audio_url: string;
  source_audio_url: string;
  stream_audio_url: string;
  source_stream_audio_url: string;
  image_url: string;
  source_image_url: string;
  prompt: string;
  model_name: string;
  title: string;
  tags: string;
  createTime: string;
  duration: number;
}

export interface MusicGenerationResponse {
  taskId: string;
  message: string;
}

export interface MusicStatusResponse {
  status: "complete" | "failed" | "pending";
  data?: GeneratedMusic[];
  message?: string;
  error?: string;
}

export interface MusicGenerationPayload {
  customMode: boolean;
  songDescription?: string;
  title?: string;
  style?: string;
  lyrics?: string;
  instrumental?: boolean;
}

// Existing location function

// Musicotron functions
export const generateMusic = async (
  payload: MusicGenerationPayload
): Promise<MusicGenerationResponse> => {
  try {
    const { data } = await axios.post<MusicGenerationResponse>(
      "/api/services/musicotron",
      payload
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw new Error(error.response.data.error || "Failed to generate music");
    }
    throw error;
  }
};

export const checkMusicStatus = async (
  taskId: string
): Promise<MusicStatusResponse> => {
  try {
    const { data } = await axios.get<MusicStatusResponse>(
      `/api/services/musicotron/status?taskId=${taskId}`
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw new Error(
        error.response.data.error || "Failed to check music status"
      );
    }
    throw error;
  }
};

// React Query Keys
export const QueryKeys = {
  location: ["location"],
  musicStatus: (taskId: string) => ["music", "status", taskId],
  musicGeneration: ["music", "generation"],
} as const;
