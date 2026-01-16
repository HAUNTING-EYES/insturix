"use client";
import React from "react";

interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message = "Ask me anything about your script" }: EmptyStateProps) {
  return (
    <div className="text-center text-muted-foreground text-sm py-12">
      <p>{message}</p>
    </div>
  );
}

