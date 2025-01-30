import { useState, useEffect } from "react";

const getCountry = async (
  lat: number,
  lon: number,
  apiKey: string
): Promise<string | null> => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === "OK") {
      const addressComponents = data.results[0].address_components;
      const countryComponent = addressComponents.find(
        (component: { types: string[]; long_name: string }) =>
          component.types.includes("country")
      );
      return countryComponent ? countryComponent.long_name : null;
    } else {
      console.log("Geocoding API error: " + data.status);
      return null;
    }
  } catch (error) {
    console.log("Error: " + error);
    return null;
  }
};

export function GlobalLocation() {
  const [country, setCountry] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(success, error);
    } else {
      console.log("Geolocation is not supported by this browser.");
    }
  }, []);

  const success = async (position: GeolocationPosition) => {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const countryName = await getCountry(lat, lon, "YOUR_GOOGLE_MAPS_API_KEY"); // Replace with your API key
    setCountry(countryName);
  };

  const error = () => {
    console.log("Unable to retrieve your location");
  };

  return { country };
}
