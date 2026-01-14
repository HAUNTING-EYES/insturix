// "use client";

// import { Suspense, useMemo, useState } from "react";
// import dynamic from "next/dynamic";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { Card, CardContent } from "@/components/ui/card";
// import { Separator } from "@/components/ui/separator";
// import { Button } from "@/components/ui/button";
// import { useToast } from "@/hooks/use-toast";

// const UploadForm = dynamic(() => import("@/components/dashboard/UploaderX/UploadForm").then(m => m.UploadForm), { ssr: false });
// const PlatformEditor = dynamic(() => import("@/components/dashboard/UploaderX/PlatformEditor").then(m => m.PlatformEditor), { ssr: false });
// const VideoManager = dynamic(() => import("@/components/dashboard/UploaderX/VideoManager").then(m => m.VideoManager), { ssr: false });

// export function UploaderXClientWrapper() {
//   const { toast } = useToast();
//   const [activeTab, setActiveTab] = useState<string>("videos");

//   const supportedPlatforms = useMemo(() => (
//     [
//       { key: "youtube", label: "YouTube" },
//       { key: "instagram", label: "Instagram" },
//       { key: "facebook", label: "Facebook" },
//     ] as const
//   ), []);

//   const handleUploadNew = () => {
//     setActiveTab("upload");
//   };

//   const handleEditVideo = (videoUuid: string) => {
//     toast({
//       title: "Edit video",
//       description: `Editing video ${videoUuid.slice(0, 8)}...`,
//     });
//   };

//   const handleDeleteVideo = (videoUuid: string) => {
//     toast({
//       title: "Video deleted",
//       description: `Video ${videoUuid.slice(0, 8)} has been deleted.`,
//     });
//   };

//   const handleUploadSuccess = (videoUuid: string) => {
//     toast({
//       title: "Upload complete",
//       description: "Your video has been uploaded successfully. You can now view and edit it.",
//     });
//     // Switch to videos tab to show the uploaded video
//     setActiveTab("videos");
//   };

//   return (
//     <div className="space-y-6">
//       <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
//         <CardContent className="p-0">
//           <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
//             <div className="flex items-center justify-between px-4 pt-4">
//               <div className="flex items-center gap-3">
//                 <TabsList className="bg-zinc-900/60 border border-zinc-800">
//                   <TabsTrigger value="videos">My Videos</TabsTrigger>
//                   <TabsTrigger value="upload">Upload</TabsTrigger>
//                   <TabsTrigger value="metadata">Per-Platform Details</TabsTrigger>
//                 </TabsList>
//               </div>
//               <div className="flex items-center gap-2">
//                 <Button
//                   variant="outline"
//                   className="border-zinc-800 text-zinc-200"
//                   onClick={() => toast({ title: "Draft saved", description: "Your inputs are stored locally for this session." })}
//                 >
//                   Save Draft
//                 </Button>
//               </div>
//             </div>

//             <Separator className="bg-zinc-800 my-4" />

//             <TabsContent value="videos" className="px-4 pb-6">
//               <Suspense fallback={<div className="h-40" />}> 
//                 <VideoManager 
//                   onUploadNew={handleUploadNew}
//                   onEditVideo={handleEditVideo}
//                   onDeleteVideo={handleDeleteVideo}
//                 />
//               </Suspense>
//             </TabsContent>

//             <TabsContent value="upload" className="px-4 pb-6">
//               <Suspense fallback={<div className="h-40" />}> 
//                 <UploadForm 
//                   platforms={supportedPlatforms as unknown as { key: string; label: string }[]} 
//                   onUploadSuccess={handleUploadSuccess}
//                 />
//               </Suspense>
//             </TabsContent>

//             <TabsContent value="metadata" className="px-4 pb-6">
//               <Suspense fallback={<div className="h-40" />}> 
//                 <PlatformEditor platforms={supportedPlatforms as unknown as { key: string; label: string }[]} />
//               </Suspense>
//             </TabsContent>
//           </Tabs>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }

// export default UploaderXClientWrapper;
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const UploadForm = dynamic(() => import("@/components/dashboard/UploaderX/UploadForm").then(m => m.UploadForm), { ssr: false });
const PlatformEditor = dynamic(() => import("@/components/dashboard/UploaderX/PlatformEditor").then(m => m.PlatformEditor), { ssr: false });
const VideoManager = dynamic(() => import("@/components/dashboard/UploaderX/VideoManager").then(m => m.VideoManager), { ssr: false });
const YouTubeConnectionStatus = dynamic(() => import("@/components/dashboard/UploaderX/YouTubeConnectionStatus").then(m => m.YouTubeConnectionStatus), { ssr: false });

export function UploaderXClientWrapper() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("videos");

  // ✅ Add this useEffect block for YouTube token capture
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      localStorage.setItem("youtube_token", token);
      toast({
        title: "YouTube connected!",
        description: "You're ready to upload videos.",
      });

      // 🧹 Clean up token from the URL
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    }
  }, [toast]);

  const supportedPlatforms = useMemo(() => (
    [
      { key: "youtube", label: "YouTube" },
      { key: "instagram", label: "Instagram" },
      { key: "facebook", label: "Facebook" },
    ] as const
  ), []);

  const handleUploadNew = () => setActiveTab("upload");
  const handleEditVideo = (videoUuid: string) =>
    toast({ title: "Edit video", description: `Editing video ${videoUuid.slice(0, 8)}...` });
  const handleDeleteVideo = (videoUuid: string) =>
    toast({ title: "Video deleted", description: `Video ${videoUuid.slice(0, 8)} has been deleted.` });
  const handleUploadSuccess = () => {
    toast({
      title: "Upload complete",
      description: "Your video has been uploaded successfully.",
    });
    setActiveTab("videos");
  };

  return (
    <div className="space-y-6">
      {/* YouTube Connection Status */}
      <YouTubeConnectionStatus />

      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between px-4 pt-4">
              <div className="flex items-center gap-3">
                <TabsList className="bg-zinc-900/60 border border-zinc-800">
                  <TabsTrigger value="videos">My Videos</TabsTrigger>
                  <TabsTrigger value="upload">Upload</TabsTrigger>
                  <TabsTrigger value="metadata">Per-Platform Details</TabsTrigger>
                </TabsList>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="border-zinc-800 text-zinc-200"
                  onClick={() => toast({
                    title: "Draft saved",
                    description: "Your inputs are stored locally for this session."
                  })}
                >
                  Save Draft
                </Button>
              </div>
            </div>

            <Separator className="bg-zinc-800 my-4" />

            <TabsContent value="videos" className="px-4 pb-6">
              <Suspense fallback={<div className="h-40" />}>
                <VideoManager
                  onUploadNew={handleUploadNew}
                  onEditVideo={handleEditVideo}
                  onDeleteVideo={handleDeleteVideo}
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="upload" className="px-4 pb-6">
              <Suspense fallback={<div className="h-40" />}>
                <UploadForm
                  platforms={supportedPlatforms as unknown as { key: string; label: string }[]}
                  onUploadSuccess={handleUploadSuccess}
                />
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
    </div>
  );
}

export default UploaderXClientWrapper;


