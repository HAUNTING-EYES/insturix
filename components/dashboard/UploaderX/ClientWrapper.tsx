"use client";

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const UploadForm = dynamic(() => import("@/components/dashboard/UploaderX/UploadForm").then(m => m.UploadForm), { ssr: false });
const PlatformEditor = dynamic(() => import("@/components/dashboard/UploaderX/PlatformEditor").then(m => m.PlatformEditor), { ssr: false });

export function UploaderXClientWrapper() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("upload");

  const supportedPlatforms = useMemo(() => (
    [
      { key: "youtube", label: "YouTube" },
      { key: "instagram", label: "Instagram" },
      { key: "facebook", label: "Facebook" },
    ] as const
  ), []);

  return (
    <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between px-4 pt-4">
            <div className="flex items-center gap-3">
              <TabsList className="bg-zinc-900/60 border border-zinc-800">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="metadata">Per-Platform Details</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="border-zinc-800 text-zinc-200"
                onClick={() => toast({ title: "Draft saved", description: "Your inputs are stored locally for this session." })}
              >
                Save Draft
              </Button>
            </div>
          </div>

          <Separator className="bg-zinc-800 my-4" />

          <TabsContent value="upload" className="px-4 pb-6">
            <Suspense fallback={<div className="h-40" />}> 
              <UploadForm platforms={supportedPlatforms as unknown as { key: string; label: string }[]} />
            </Suspense>
          </TabsContent>

          <TabsContent value="metadata" className="px-4 pb-6">
            <Suspense fallback={<div className="h-40" />}> 
              <PlatformEditor platforms={supportedPlatforms as unknown as { key: string; label: string }[]} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default UploaderXClientWrapper;


