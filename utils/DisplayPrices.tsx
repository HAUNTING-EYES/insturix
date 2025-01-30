import React from "react";
import { GlobalLocation } from "@/utils/GlobalLocation";

export default function ShowLocation() {
  const location = GlobalLocation();

  return (
    <div>
      {location.country ? (
        <p>Country: {location.country}</p>
      ) : (
        <p>No country available</p>
      )}
    </div>
  );
}
