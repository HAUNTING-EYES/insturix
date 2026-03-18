import axios from "axios";


export interface LocationData {
  currency: string;
  symbol: string;
}

export const fetchLocationData = async (): Promise<LocationData> => {
  const { data } = await axios.get<LocationData>("/api/location");
  return data;
};

// React Query Keys
export const QueryKeys = {
  location: ["location"],
} as const;
