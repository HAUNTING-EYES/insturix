import axios from "axios";

interface LocationData {
  currency: string;
  symbol: string;
}

export const fetchLocationData = async (): Promise<LocationData> => {
  const { data } = await axios.get<LocationData>("/api/location");
  return data;
};
