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
const FacebookConnectionStatus = dynamic(() => import("@/components/dashboard/UploaderX/FacebookConnectionStatus").then(m => m.FacebookConnectionStatus), { ssr: false });
const InstagramConnectionStatus = dynamic(() => import("@/components/dashboard/UploaderX/InstagramConnectionStatus").then(m => m.InstagramConnectionStatus), { ssr: false });
const TwitterConnectionStatus = dynamic(() => import("@/components/dashboard/UploaderX/TwitterConnectionStatus").then(m => m.TwitterConnectionStatus), { ssr: false });
const LinkedInConnectionStatus = dynamic(() => import("@/components/dashboard/UploaderX/LinkedInConnectionStatus").then(m => m.LinkedInConnectionStatus), { ssr: false });
const TwitterPermissionsStatus = dynamic(() => import("@/components/dashboard/UploaderX/TwitterPermissionsStatus").then(m => m.TwitterPermissionsStatus), { ssr: false });

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

  // ✅ Handle Facebook connection feedback from callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fbConnected = params.get("fb_connected");
    const fbError = params.get("fb_error");

    if (fbConnected === "true") {
      toast({
        title: "Facebook connected!",
        description: "You can now upload videos to your Facebook Pages.",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    } else if (fbError) {
      let errorMsg = "Failed to connect Facebook.";
      if (fbError === "denied") errorMsg = "Facebook connection was denied. Please try again.";
      if (fbError === "token_exchange") errorMsg = "Facebook token exchange failed. Please try again.";
      if (fbError === "pages_fetch") errorMsg = "Could not fetch your Facebook Pages. Please ensure you have admin access.";
      toast({
        title: "Facebook Connection Error",
        description: errorMsg,
        variant: "destructive",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    }
  }, [toast]);

  // ✅ Handle Instagram connection feedback from callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const igConnected = params.get("ig_connected");
    const igError = params.get("ig_error");

    if (igConnected === "true") {
      toast({
        title: "Instagram connected!",
        description: "You can now publish Reels to your Instagram Business account.",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    } else if (igError) {
      let errorMsg = "Failed to connect Instagram.";
      if (igError === "denied") errorMsg = "Instagram connection was denied. Please try again.";
      if (igError === "token_exchange") errorMsg = "Instagram token exchange failed. Please try again.";
      if (igError === "pages_fetch") errorMsg = "Could not fetch your Facebook Pages. Please ensure you have admin access.";
      if (igError === "no_accounts") errorMsg = "No Instagram Business accounts found connected to your Facebook Pages.";
      toast({
        title: "Instagram Connection Error",
        description: errorMsg,
        variant: "destructive",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    }
  }, [toast]);

  // ✅ Handle Twitter connection feedback from callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const twitterConnected = params.get("twitter_connected");
    const twitterError = params.get("twitter_error");
    const twitterScopesWarning = params.get("twitter_scopes_warning");

    if (twitterConnected === "true") {
      toast({
        title: "Twitter connected!",
        description: "You can now post videos to your Twitter/X account.",
      });

      // Show warning if some permissions are missing
      if (twitterScopesWarning) {
        const missingScopes = twitterScopesWarning.split(",");
        toast({
          title: "⚠️ Missing Permissions",
          description: `Some permissions were not granted: ${missingScopes.join(", ")}. Some features may not work correctly.`,
          variant: "destructive",
        });
      }

      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    } else if (twitterError) {
      let errorMsg = "Failed to connect Twitter.";
      if (twitterError === "denied") errorMsg = "Twitter connection was denied. Please try again.";
      if (twitterError === "token_exchange") errorMsg = "Twitter token exchange failed. Please try again.";
      if (twitterError === "state_mismatch") errorMsg = "Security validation failed. Please try again.";
      if (twitterError === "no_verifier") errorMsg = "OAuth session expired. Please try again.";
      if (twitterError === "profile_fetch") errorMsg = "Could not fetch your Twitter profile. Please try again.";
      toast({
        title: "Twitter Connection Error",
        description: errorMsg,
        variant: "destructive",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    }
  }, [toast]);

  // ✅ Handle LinkedIn connection feedback from callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedinConnected = params.get("linkedin_connected");
    const linkedinError = params.get("linkedin_error");

    if (linkedinConnected === "true") {
      toast({
        title: "LinkedIn connected!",
        description: "You can now post content to LinkedIn.",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    } else if (linkedinError) {
      let errorMsg = "Failed to connect LinkedIn.";
      if (linkedinError === "denied") errorMsg = "LinkedIn connection was denied. Please try again.";
      if (linkedinError === "token_exchange") errorMsg = "LinkedIn token exchange failed. Please try again.";
      if (linkedinError === "profile_fetch") errorMsg = "Could not fetch your LinkedIn profile. Please try again.";
      toast({
        title: "LinkedIn Connection Error",
        description: errorMsg,
        variant: "destructive",
      });
      window.history.replaceState({}, document.title, "/dashboard/uploaderx");
    }
  }, [toast]);

  const supportedPlatforms = useMemo(() => (
    [
      { key: "youtube", label: "YouTube" },
      { key: "instagram", label: "Instagram" },
      { key: "facebook", label: "Facebook" },
      { key: "twitter", label: "Twitter" },
      { key: "linkedin", label: "LinkedIn" },
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
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between px-4 pt-4">
              <div className="flex items-center gap-3">
                <TabsList className="bg-zinc-900/60 border border-zinc-800">
                  <TabsTrigger value="videos">My Videos</TabsTrigger>
                  <TabsTrigger value="upload">Upload</TabsTrigger>
                  <TabsTrigger value="connections">Connections</TabsTrigger>
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

            <TabsContent value="connections" className="px-4 pb-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Suspense fallback={<div className="h-40" />}>
                  <YouTubeConnectionStatus />
                </Suspense>
                <Suspense fallback={<div className="h-40" />}>
                  <FacebookConnectionStatus />
                </Suspense>
                <Suspense fallback={<div className="h-40" />}>
                  <InstagramConnectionStatus />
                </Suspense>
                <Suspense fallback={<div className="h-40" />}>
                  <TwitterConnectionStatus />
                </Suspense>
                <Suspense fallback={<div className="h-40" />}>
                  <TwitterPermissionsStatus />
                </Suspense>
                <Suspense fallback={<div className="h-40" />}>
                  <LinkedInConnectionStatus />
                </Suspense>
              </div>
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


