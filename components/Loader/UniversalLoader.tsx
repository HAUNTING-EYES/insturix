"use client";

import React from "react";

export function UniversalLoader() {
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
    </div>
  );
}

export default UniversalLoader;