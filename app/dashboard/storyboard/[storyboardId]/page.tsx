"use client";

import { useParams } from "next/navigation";
import { StoryboardWorkspace } from "@/components/dashboard/storyboard/StoryboardWorkspace";

export default function StoryboardPage() {
  const params = useParams();
  const storyboardId = params.storyboardId as string;

  return <StoryboardWorkspace storyboardId={storyboardId} />;
}
