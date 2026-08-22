"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Youtube, Instagram, Facebook, Save, Eye, EyeOff } from "lucide-react";
import {
  isUploaderXFieldSupported,
  type UploaderXPlatform,
} from "@/lib/uploaderx/platform-capabilities";

type Platform = { key: string; label: string };

const UNSUPPORTED_CONTROL_TITLE = "This field is not wired to the platform API yet.";

function isKnownUploaderXPlatform(platform: string): platform is UploaderXPlatform {
  return ["youtube", "instagram", "facebook", "twitter", "linkedin"].includes(platform);
}

function isFieldSupported(platform: string, field: string) {
  return isKnownUploaderXPlatform(platform) && isUploaderXFieldSupported(platform, field);
}

interface PlatformData {
  title: string;
  description: string;
  tags: string[];
  isPublic: boolean;
  thumbnail?: string;
  category?: string;
  language?: string;
  youtube?: {
    categoryId: string;
    privacyStatus: string;
    scheduledTime?: string;
  };
  instagram?: {
    caption?: string;
    location?: string;
    altText?: string;
  };
  facebook?: {
    message?: string;
    privacy: string;
    scheduledTime?: string;
  };
}

interface PlatformEditorProps {
  platforms: Platform[];
  videoUuid?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultTags?: string;
  initialData?: Record<string, PlatformData>;
  onSave?: (platformData: Record<string, any>) => void;
}

// ... (PlatformData interface remains same) ...

export function PlatformEditor({
  platforms,
  videoUuid,
  defaultTitle = "",
  defaultDescription = "",
  defaultTags = "",
  initialData,
  onSave
}: PlatformEditorProps) {
  const { toast } = useToast();
  const [activePlatform, setActivePlatform] = useState<string>(platforms[0]?.key || '');
  const [platformData, setPlatformData] = useState<Record<string, PlatformData>>({});
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Initialize platform data
  useEffect(() => {
    const initial: Record<string, PlatformData> = {};
    platforms.forEach(platform => {
      // Check if we have existing data for this platform
      const existing = initialData?.[platform.key];

      initial[platform.key] = {
        title: existing?.title || defaultTitle,
        description: existing?.description || defaultDescription,
        tags: existing?.tags || defaultTags.split(',').map(tag => tag.trim()).filter(Boolean),
        isPublic: existing?.isPublic ?? true,
        thumbnail: existing?.thumbnail,
        category: existing?.category,
        language: existing?.language,
        youtube: {
          categoryId: existing?.youtube?.categoryId || '22', // People & Blogs
          privacyStatus: existing?.youtube?.privacyStatus || 'private',
          scheduledTime: existing?.youtube?.scheduledTime
        },
        instagram: {
          caption: existing?.instagram?.caption || defaultDescription,
          location: existing?.instagram?.location,
          altText: existing?.instagram?.altText,
        },
        facebook: {
          message: existing?.facebook?.message || defaultDescription,
          privacy: existing?.facebook?.privacy || 'everyone',
          scheduledTime: existing?.facebook?.scheduledTime
        },
      };
    });
    setPlatformData(initial);
  }, [platforms, defaultTitle, defaultDescription, defaultTags, initialData]);

  const updatePlatformData = (platform: string, field: string, value: any) => {
    setPlatformData(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  };

  const updateNestedData = (platform: string, parentField: string, field: string, value: any) => {
    setPlatformData(prev => {
      const currentPlatform = prev[platform] || {};
      const currentNested = currentPlatform[parentField as keyof PlatformData];
      const nestedObject = typeof currentNested === 'object' && currentNested !== null ? currentNested : {};

      return {
        ...prev,
        [platform]: {
          ...currentPlatform,
          [parentField]: {
            ...nestedObject,
            [field]: value,
          },
        },
      };
    });
  };

  const handleSave = () => {
    if (onSave) {
      onSave(platformData);
    }
    toast({
      title: "Platform settings saved",
      description: "Your platform-specific settings have been saved.",
    });
  };

  const getPlatformIcon = (platformKey: string) => {
    switch (platformKey) {
      case 'youtube': return <Youtube className="h-4 w-4" />;
      case 'instagram': return <Instagram className="h-4 w-4" />;
      case 'facebook': return <Facebook className="h-4 w-4" />;
      default: return null;
    }
  };

  const getPlatformColor = (platformKey: string) => {
    switch (platformKey) {
      case 'youtube': return 'text-red-500';
      case 'instagram': return 'text-pink-500';
      case 'facebook': return 'text-blue-500';
      default: return 'text-zinc-500';
    }
  };

  const renderPlatformContent = (platform: string) => {
    const data = platformData[platform];
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-200">Basic Information</h3>

          <div>
            <Label className="text-zinc-200">Title</Label>
            <Input
              value={data.title}
              onChange={(e) => updatePlatformData(platform, 'title', e.target.value)}
              placeholder="Enter video title"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-zinc-200">Description</Label>
            <Textarea
              value={data.description}
              onChange={(e) => updatePlatformData(platform, 'description', e.target.value)}
              placeholder="Enter video description"
              rows={4}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-zinc-200">Tags</Label>
            <Input
              value={data.tags.join(', ')}
              onChange={(e) => updatePlatformData(platform, 'tags', e.target.value.split(',').map(tag => tag.trim()).filter(Boolean))}
              placeholder="Enter tags separated by commas"
              className="mt-1"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-zinc-200">Make Public</Label>
            <Switch
              checked={data.isPublic}
              onCheckedChange={(checked) => updatePlatformData(platform, 'isPublic', checked)}
            />
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* Platform-Specific Settings */}
        {platform === 'youtube' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-zinc-200">YouTube Settings</h3>

            <div>
              <Label className="text-zinc-200">Privacy Status</Label>
              <select
                value={data.youtube?.privacyStatus || 'private'}
                onChange={(e) => updateNestedData(platform, 'youtube', 'privacyStatus', e.target.value)}
                className="mt-1 w-full p-2 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200"
              >
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            </div>

            <div>
              <Label className="text-zinc-200">Category</Label>
              <select
                value={data.youtube?.categoryId || '22'}
                onChange={(e) => updateNestedData(platform, 'youtube', 'categoryId', e.target.value)}
                className="mt-1 w-full p-2 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200"
              >
                <option value="22">People & Blogs</option>
                <option value="24">Entertainment</option>
                <option value="25">News & Politics</option>
                <option value="26">Howto & Style</option>
                <option value="27">Education</option>
                <option value="28">Science & Technology</option>
              </select>
            </div>

            <div>
              <Label className="text-zinc-200">Schedule Upload (Optional)</Label>
              <Input
                type="datetime-local"
                value={data.youtube?.scheduledTime || ''}
                disabled={!isFieldSupported(platform, 'publishAt')}
                title={isFieldSupported(platform, 'publishAt') ? undefined : UNSUPPORTED_CONTROL_TITLE}
                onChange={(e) => updateNestedData(platform, 'youtube', 'scheduledTime', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        )}

        {platform === 'instagram' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-zinc-200">Instagram Settings</h3>

            <div>
              <Label className="text-zinc-200">Caption</Label>
              <Textarea
                value={data.instagram?.caption || ''}
                onChange={(e) => updateNestedData(platform, 'instagram', 'caption', e.target.value)}
                placeholder="Instagram caption with hashtags"
                rows={3}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-zinc-200">Location (Optional)</Label>
              <Input
                value={data.instagram?.location || ''}
                disabled={!isFieldSupported(platform, 'location')}
                title={isFieldSupported(platform, 'location') ? undefined : UNSUPPORTED_CONTROL_TITLE}
                onChange={(e) => updateNestedData(platform, 'instagram', 'location', e.target.value)}
                placeholder="Add location"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-zinc-200">Alt Text</Label>
              <Input
                value={data.instagram?.altText || ''}
                disabled={!isFieldSupported(platform, 'altText')}
                title={isFieldSupported(platform, 'altText') ? undefined : UNSUPPORTED_CONTROL_TITLE}
                onChange={(e) => updateNestedData(platform, 'instagram', 'altText', e.target.value)}
                placeholder="Describe the video for accessibility"
                className="mt-1"
              />
            </div>
          </div>
        )}

        {platform === 'facebook' && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-zinc-200">Facebook Settings</h3>

            <div>
              <Label className="text-zinc-200">Message</Label>
              <Textarea
                value={data.facebook?.message || ''}
                onChange={(e) => updateNestedData(platform, 'facebook', 'message', e.target.value)}
                placeholder="What's on your mind?"
                rows={3}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-zinc-200">Privacy</Label>
              <select
                value={data.facebook?.privacy || 'everyone'}
                disabled={!isFieldSupported(platform, 'privacy')}
                title={isFieldSupported(platform, 'privacy') ? undefined : UNSUPPORTED_CONTROL_TITLE}
                onChange={(e) => updateNestedData(platform, 'facebook', 'privacy', e.target.value)}
                className="mt-1 w-full p-2 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200"
              >
                <option value="everyone">Public</option>
                <option value="friends">Friends</option>
                <option value="only_me">Only Me</option>
              </select>
            </div>

            <div>
              <Label className="text-zinc-200">Schedule Post (Optional)</Label>
              <Input
                type="datetime-local"
                value={data.facebook?.scheduledTime || ''}
                disabled={!isFieldSupported(platform, 'publishAt')}
                title={isFieldSupported(platform, 'publishAt') ? undefined : UNSUPPORTED_CONTROL_TITLE}
                onChange={(e) => updateNestedData(platform, 'facebook', 'scheduledTime', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-zinc-200">Platform-Specific Settings</h2>
          <p className="text-sm text-zinc-400">Customize your video for each platform</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className="border-zinc-800 text-zinc-200"
          >
            {isPreviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {isPreviewMode ? 'Edit' : 'Preview'}
          </Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500">
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </div>

      {/* Platform Tabs */}
      <Tabs value={activePlatform} onValueChange={setActivePlatform}>
        <TabsList className="bg-zinc-900/60 border border-zinc-800">
          {platforms.map((platform) => (
              <TabsTrigger 
                key={platform.key} 
                value={platform.key}
                className="flex items-center gap-2"
              >
                {getPlatformIcon(platform.key)}
                <span>{platform.label}</span>
              </TabsTrigger>
          ))}
        </TabsList>

        {platforms.map((platform) => (
          <TabsContent key={platform.key} value={platform.key} className="mt-6">
            <Card className="bg-zinc-950/60 border-zinc-800">
              <CardContent className="p-6">
                {renderPlatformContent(platform.key)}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default PlatformEditor;
