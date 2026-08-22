"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useUploaderXUpload } from "@/hooks/useUploaderXUpload";
import { UploadCloud, Image as ImageIcon, Youtube, Instagram, Facebook, Twitter, Linkedin, CheckCircle, AlertCircle } from "lucide-react";
import { PlatformConnectionStatus } from "./PlatformConnectionStatus";

type Platform = { key: string; label: string };

interface UploadFormProps {
  platforms: Platform[];
  onUploadSuccess?: (videoUuid: string) => void;
}

export function UploadForm({ platforms, onUploadSuccess }: UploadFormProps) {
  const { toast } = useToast();
  const { uploadWithProgress, uploadThumbnail, uploadToYouTube, uploadToFacebook, uploadToInstagram, uploadToTwitter, uploadToLinkedIn, isUploading, uploadProgress } = useUploaderXUpload();

  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({
    youtube: true,
    instagram: false,
    facebook: false,
    twitter: false,
    linkedin: false,
  });
  const [activeType, setActiveType] = useState<string>("short");

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [defaultTitle, setDefaultTitle] = useState("");
  const [defaultDescription, setDefaultDescription] = useState("Uploaded via Insturix UploaderX - Your all-in-one content distribution tool.");
  const [defaultTags, setDefaultTags] = useState("Insturix, UploaderX, ContentCreation");
  const [privacyStatus, setPrivacyStatus] = useState("private");
  const [uploadResult, setUploadResult] = useState<{ success: boolean; videoUuid?: string; error?: string } | null>(null);

  const selectedPlatformKeys = useMemo(
    () => Object.entries(selectedPlatforms).filter(([, enabled]) => enabled).map(([key]) => key),
    [selectedPlatforms]
  );
  const isLinkedInOnly = selectedPlatformKeys.length === 1 && selectedPlatformKeys[0] === "linkedin";
  const isTwitterOnly = selectedPlatformKeys.length === 1 && selectedPlatformKeys[0] === "twitter";
  const hasTextOnlyPostContent = !!(defaultTitle.trim() || defaultDescription.trim());
  const isReady = useMemo(() => {
    if (selectedPlatformKeys.length === 0) {
      return false;
    }
    if (videoFile) {
      return true;
    }
    return (isLinkedInOnly || isTwitterOnly) && hasTextOnlyPostContent;
  }, [videoFile, selectedPlatformKeys, isLinkedInOnly, isTwitterOnly, hasTextOnlyPostContent]);

  const handleSubmit = async () => {
    if (!videoFile && !((isLinkedInOnly || isTwitterOnly) && hasTextOnlyPostContent)) {
      toast({
        title: "Video required",
        description: "Please select a video file, or use LinkedIn/Twitter only for a text post.",
        variant: "destructive"
      });
      return;
    }

    if (!videoFile && isLinkedInOnly) {
      try {
        toast({
          title: "Posting to LinkedIn...",
          description: "Publishing your text post."
        });

        const linkedinResult = await uploadToLinkedIn(undefined, undefined, defaultTitle, defaultDescription);
        if (linkedinResult.success) {
          toast({
            title: "Posted to LinkedIn",
            description: "Your text post is live on LinkedIn."
          });
        } else {
          toast({
            title: "LinkedIn post failed",
            description: linkedinResult.error,
            variant: "destructive"
          });
        }
      } catch (error) {
        toast({
          title: "LinkedIn post failed",
          description: "An error occurred while publishing your LinkedIn post.",
          variant: "destructive"
        });
      }
      return;
    }

    if (!videoFile && isTwitterOnly) {
      try {
        toast({
          title: "Posting to Twitter...",
          description: "Publishing your text post."
        });

        const twitterResult = await uploadToTwitter(undefined, undefined, defaultTitle, defaultDescription);
        if (twitterResult.success) {
          toast({
            title: "Posted to Twitter",
            description: "Your text post is live on Twitter/X."
          });
        } else {
          toast({
            title: "Twitter post failed",
            description: twitterResult.error,
            variant: "destructive"
          });
        }
      } catch (error) {
        toast({
          title: "Twitter post failed",
          description: "An error occurred while publishing your Twitter/X post.",
          variant: "destructive"
        });
      }
      return;
    }

    const selectedVideoFile = videoFile;
    if (!selectedVideoFile) {
      return;
    }

    try {
      const result = await uploadWithProgress(selectedVideoFile, (progress) => {
        // Progress is handled by the hook
      }, {
        title: defaultTitle || selectedVideoFile.name,
        description: defaultDescription,
        tags: defaultTags ? defaultTags.split(',').map(tag => tag.trim()).filter(Boolean) : [],
        privacyStatus,
        videoType: activeType
      });

      setUploadResult(result);

      if (result.success && result.videoUuid && result.gcsPath) {
        const videoUuid = result.videoUuid;
        const gcsPath = result.gcsPath;
        
        toast({
          title: "Video saved securely",
          description: `Processing platform uploads...`
        });

        // Track which platforms succeeded
        let youtubeSuccess = false;
        let facebookSuccess = false;
        let instagramSuccess = false;
        let twitterSuccess = false;
        let linkedinSuccess = false;

        // 🚀 Run platform uploads in parallel for better performance
        const uploadPromises = [];

        // 🎬 YouTube Upload
        if (selectedPlatforms.youtube) {
          const youtubeUpload = (async () => {
            try {
              toast({ title: "Uploading to YouTube...", description: "Sending video to your channel." });

              const finalTitle = defaultTitle || selectedVideoFile.name;
              const finalDescription = defaultDescription;

              let thumbnailPublicUrl: string | undefined;
              if (thumbnailFile) {
                const thumbnailResult = await uploadThumbnail(thumbnailFile);
                if (!thumbnailResult.success || !thumbnailResult.publicUrl) {
                  toast({
                    title: "YouTube thumbnail upload failed",
                    description: thumbnailResult.error || "Could not upload the selected thumbnail.",
                    variant: "destructive",
                  });
                  return;
                }
                thumbnailPublicUrl = thumbnailResult.publicUrl;
              }

              const result = await uploadToYouTube(
                videoUuid,
                gcsPath,
                selectedVideoFile.name,
                finalTitle,
                finalDescription,
                privacyStatus,
                undefined,
                undefined,
                thumbnailPublicUrl,
                activeType === 'short' ? 'short' : 'video'
              );
              if (result.success) {
                youtubeSuccess = true;
                toast({ title: "✅ Uploaded to YouTube", description: "Your video is live!" });
              } else {
                toast({ title: "❌ YouTube upload failed", description: result.error, variant: "destructive" });
              }
            } catch (error) {
              console.error("YouTube upload error:", error);
              toast({ title: "❌ YouTube upload failed", description: "An unexpected error occurred", variant: "destructive" });
            }
          })();
          uploadPromises.push(youtubeUpload);
        }

        // 🔵 Facebook Upload
        if (selectedPlatforms.facebook) {
          const facebookUpload = (async () => {
            try {
              toast({ title: "Uploading to Facebook...", description: "Sending to your page." });

              const result = await uploadToFacebook(
                videoUuid,
                gcsPath,
                defaultTitle,
                defaultDescription,
                undefined,
                activeType === 'short' ? 'reel' : 'video'
              );
              if (result.success) {
                facebookSuccess = true;
                toast({ title: "✅ Uploaded to Facebook", description: `Posted to ${result.pageName || 'your page'}!` });
              } else {
                toast({ title: "❌ Facebook upload failed", description: result.error, variant: "destructive" });
              }
            } catch (error) {
              console.error("Facebook upload error:", error);
              toast({ title: "❌ Facebook upload failed", description: "An unexpected error occurred", variant: "destructive" });
            }
          })();
          uploadPromises.push(facebookUpload);
        }

        // 🟣 Instagram Upload
        if (selectedPlatforms.instagram) {
          const instagramUpload = (async () => {
            try {
              toast({ title: "Uploading to Instagram...", description: "Publishing as Reel." });

              const result = await uploadToInstagram(
                videoUuid,
                gcsPath,
                defaultTitle,
                defaultDescription,
                undefined,
                activeType === 'short' ? 'reel' : 'feed_video'
              );
              if (result.success) {
                instagramSuccess = true;
                toast({ title: "✅ Uploaded to Instagram", description: `Reel published to ${result.accountUsername || 'your account'}!` });
              } else {
                toast({ title: "❌ Instagram upload failed", description: result.error, variant: "destructive" });
              }
            } catch (error) {
              console.error("Instagram upload error:", error);
              toast({ title: "❌ Instagram upload failed", description: "An unexpected error occurred", variant: "destructive" });
            }
          })();
          uploadPromises.push(instagramUpload);
        }

        // 🐦 Twitter Upload
        if (selectedPlatforms.twitter) {
          const twitterUpload = (async () => {
            try {
              toast({ title: "Uploading to Twitter...", description: "Posting to your account." });

              const result = await uploadToTwitter(
                videoUuid,
                gcsPath,
                defaultTitle,
                defaultDescription,
                undefined,
                'video'
              );
              if (result.success) {
                twitterSuccess = true;
                toast({ title: "✅ Posted to Twitter", description: `Tweet posted to ${result.accountUsername || 'your account'}!` });
              } else {
                toast({ title: "❌ Twitter upload failed", description: result.error, variant: "destructive" });
              }
            } catch (error) {
              console.error("Twitter upload error:", error);
              toast({ title: "❌ Twitter upload failed", description: "An unexpected error occurred", variant: "destructive" });
            }
          })();
          uploadPromises.push(twitterUpload);
        }

        // 🔗 LinkedIn Upload
        if (selectedPlatforms.linkedin) {
          const linkedinUpload = (async () => {
            try {
              toast({ title: "Uploading to LinkedIn...", description: "Posting to your profile." });

              const result = await uploadToLinkedIn(
                videoUuid,
                gcsPath,
                defaultTitle,
                defaultDescription,
                undefined,
                undefined,
                'video'
              );
              if (result.success) {
                linkedinSuccess = true;
                toast({ title: "✅ Posted to LinkedIn", description: `Post published to ${result.postType === 'organization' ? result.organizationName || 'organization' : 'your profile'}!` });
              } else {
                toast({ title: "❌ LinkedIn upload failed", description: result.error, variant: "destructive" });
              }
            } catch (error) {
              console.error("LinkedIn upload error:", error);
              toast({ title: "❌ LinkedIn upload failed", description: "An unexpected error occurred", variant: "destructive" });
            }
          })();
          uploadPromises.push(linkedinUpload);
        }

        // Wait for all selected platform uploads to complete
        if (uploadPromises.length > 0) {
          await Promise.all(uploadPromises);

          // Show summary toast
          const summary = [];
          if (youtubeSuccess) summary.push("✅ YouTube");
          if (facebookSuccess) summary.push("✅ Facebook");
          if (instagramSuccess) summary.push("✅ Instagram");
          if (twitterSuccess) summary.push("✅ Twitter");
          if (linkedinSuccess) summary.push("✅ LinkedIn");
          if (!youtubeSuccess && selectedPlatforms.youtube) summary.push("❌ YouTube");
          if (!facebookSuccess && selectedPlatforms.facebook) summary.push("❌ Facebook");
          if (!instagramSuccess && selectedPlatforms.instagram) summary.push("❌ Instagram");
          if (!twitterSuccess && selectedPlatforms.twitter) summary.push("❌ Twitter");
          if (!linkedinSuccess && selectedPlatforms.linkedin) summary.push("❌ LinkedIn");

          toast({
            title: "Platform Upload Summary",
            description: summary.join(" | "),
            duration: 5000,
          });
        }

        // Call success callback if provided
        if (onUploadSuccess && result.videoUuid) {
          onUploadSuccess(result.videoUuid);
        }
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "An error occurred during upload. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2 relative h-full">
      {/* 🚀 New Professional Loading Overlay */}
      {isUploading && (
        <div className="absolute inset-x-0 -inset-y-4 z-50 rounded-2xl bg-black/70 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 rounded-full border-b-2 border-blue-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-t-2 border-emerald-500 animate-spin-slow" />
            <div className="absolute inset-0 flex items-center justify-center">
              <UploadCloud className="h-8 w-8 text-white animate-pulse" />
            </div>
          </div>
          <h3 className="mt-6 text-[18px] font-semibold text-zinc-100 italic">Distributing your content...</h3>
          <p className="mt-2 text-zinc-400 max-w-xs text-sm">
            We are uploading your video to our secure storage and preparing platform distributions.
          </p>
          <div className="mt-8 w-full max-w-sm space-y-2">
            <div className="flex justify-between text-[11px] text-zinc-500 mb-1 px-1">
              <span>Overall Progress</span>
              <span>{uploadProgress?.percentage || 0}%</span>
            </div>
            <Progress value={uploadProgress?.percentage || 0} className="h-2 bg-zinc-800" />
          </div>
        </div>
      )}

      <Card className="bg-zinc-950/60 border-zinc-800 h-full">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-zinc-200">Select content type</Label>
            <Tabs value={activeType} onValueChange={setActiveType} className="mt-2">
              <TabsList className="bg-zinc-900/60 border border-zinc-800">
                <TabsTrigger value="short">Shorts/Reels</TabsTrigger>
                <TabsTrigger value="long">Long form</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-200">Video</Label>
              <label className={`mt-2 flex flex-col items-center justify-center gap-3 h-40 border-2 border-dashed rounded-lg transition cursor-pointer ${isUploading
                ? 'border-blue-500 bg-blue-900/20 cursor-not-allowed'
                : uploadResult?.success
                  ? 'border-green-500 bg-green-900/20'
                  : uploadResult?.error
                    ? 'border-red-500 bg-red-900/20'
                    : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/60'
                }`}>
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                    <div className="text-center">
                      <div className="text-blue-200 text-sm font-medium">Uploading...</div>
                      <div className="text-blue-400 text-[11px]">{uploadProgress?.percentage || 0}% complete</div>
                    </div>
                    {uploadProgress && (
                      <div className="w-full max-w-xs">
                        <Progress value={uploadProgress.percentage} className="h-2" />
                      </div>
                    )}
                  </div>
                ) : uploadResult?.success ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle className="h-6 w-6 text-green-400" />
                    <div className="text-center">
                      <div className="text-green-200 text-sm font-medium">Upload successful</div>
                      <div className="text-green-400 text-[11px]">Video ID: {uploadResult.videoUuid}</div>
                    </div>
                  </div>
                ) : uploadResult?.error ? (
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6 text-red-400" />
                    <div className="text-center">
                      <div className="text-red-200 text-sm font-medium">Upload failed</div>
                      <div className="text-red-400 text-[11px]">{uploadResult.error}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="h-6 w-6 text-emerald-400" />
                    <div className="text-center">
                      <div className="text-zinc-200 text-sm font-medium">Drag & drop your video</div>
                      <div className="text-zinc-400 text-[11px]">or click to choose a file</div>
                    </div>
                  </>
                )}
                <Input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  disabled={isUploading}
                  onChange={(e) => {
                    setVideoFile(e.target.files?.[0] || null);
                    setUploadResult(null);
                  }}
                />
              </label>
              {videoFile && !isUploading && (
                <div className="mt-2 text-[11px] text-zinc-400">
                  Selected: {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(2)} MB)
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-zinc-200">Thumbnail</Label>
                <span className="text-[11px] text-zinc-400">Optional</span>
              </div>
              <label className="mt-2 flex flex-col items-center justify-center gap-3 h-40 border-2 border-dashed border-zinc-800 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/60 transition cursor-pointer">
                <ImageIcon className="h-6 w-6 text-blue-400" />
                <div className="text-center">
                  <div className="text-zinc-200 text-sm font-medium">Drag & drop an image</div>
                  <div className="text-zinc-400 text-[11px]">PNG, JPG</div>
                </div>
                <Input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} />
              </label>
              {thumbnailFile && <div className="mt-2 text-[11px] text-zinc-400">Selected: {thumbnailFile.name}</div>}
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          <div className="grid gap-4">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-zinc-200">Default title</Label>
                <span className="text-[11px] text-zinc-400">Used if platform title is empty</span>
              </div>
              <Input value={defaultTitle} onChange={(e) => setDefaultTitle(e.target.value)} placeholder="Enter a title" className="mt-2" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-200">Privacy Status</Label>
                <select
                  value={privacyStatus}
                  onChange={(e) => setPrivacyStatus(e.target.value)}
                  className="mt-2 flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-200 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>
              <div>
                <Label className="text-zinc-200">Default tags</Label>
                <Input value={defaultTags} onChange={(e) => setDefaultTags(e.target.value)} placeholder="Add tags..." className="mt-2" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-zinc-200">Default description</Label>
                <span className="text-[11px] text-zinc-400">You can override per platform</span>
              </div>
              <Textarea value={defaultDescription} onChange={(e) => setDefaultDescription(e.target.value)} placeholder="Write a description" className="mt-2" rows={5} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-950/60 border-zinc-800">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-zinc-200">Select platforms</Label>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
              {platforms.map((p) => {
                const isActive = !!selectedPlatforms[p.key];
                const color = p.key === 'youtube' ? 'red' : p.key === 'instagram' ? 'pink' : p.key === 'facebook' ? 'blue' : p.key === 'twitter' ? 'sky' : 'blue';
                const icon = p.key === 'youtube' ? Youtube : p.key === 'instagram' ? Instagram : p.key === 'facebook' ? Facebook : p.key === 'twitter' ? Twitter : Linkedin;
                const Icon = icon;
                const colorClass = p.key === 'youtube' ? 'text-red-500' : p.key === 'instagram' ? 'text-pink-500' : p.key === 'facebook' ? 'text-blue-500' : p.key === 'twitter' ? 'text-sky-500' : 'text-blue-600';
                const isDisabled = false;
                return (
                  <button
                    key={p.key}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setSelectedPlatforms(s => ({ ...s, [p.key]: !s[p.key] }))}
                    className={`h-20 rounded-lg border transition flex flex-col items-center justify-center gap-2 ${isActive ? 'border-white/20 bg-white/5' : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/60'}`}
                  >
                    <Icon className={`h-5 w-5 ${colorClass}`} />
                    <span className="text-sm text-zinc-200">{p.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 🔗 Platform Connection Status */}
            <div className="mt-4">
              <PlatformConnectionStatus />
            </div>
          </div>

          <Separator className="bg-zinc-800" />

	          <div className="flex items-center justify-between">
	            <div className="text-sm text-zinc-400">
	              {videoFile
	                ? `${videoFile.name} (${(videoFile.size / (1024 * 1024)).toFixed(2)} MB)`
	                : isLinkedInOnly
	                  ? "LinkedIn text-only post ready"
	                  : isTwitterOnly
	                    ? "Twitter text-only post ready"
	                  : "No video selected"}
	            </div>
	            <Button
	              disabled={!isReady || isUploading}
	              onClick={handleSubmit}
	              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
	            >
	              {isUploading ? "Uploading..." : isLinkedInOnly && !videoFile ? "Post to LinkedIn" : isTwitterOnly && !videoFile ? "Post to Twitter" : "Upload Video"}
	            </Button>
	          </div>

          {uploadResult?.success && (
            <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-green-200 text-sm">
                <CheckCircle className="h-4 w-4" />
                <span>Video saved to Safe Storage</span>
              </div>
              <div className="text-[11px] text-green-400 mt-1">
                Ref ID: {uploadResult.videoUuid}
              </div>
            </div>
          )}

          {uploadResult?.error && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-red-200 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Upload failed</span>
              </div>
              <div className="text-[11px] text-red-400 mt-1">
                {uploadResult.error}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default UploadForm;
