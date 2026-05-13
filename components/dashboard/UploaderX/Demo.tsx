"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, 
  Play, 
  Edit, 
  Download, 
  Trash2, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Video,
  Settings,
  Users
} from "lucide-react";

export function UploaderXDemo() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const steps = [
    {
      title: "Upload Video",
      description: "Select and upload your video to GCS",
      icon: <Upload className="h-5 w-5" />,
      status: "completed"
    },
    {
      title: "Video Processing",
      description: "Video is processed and made available",
      icon: <Clock className="h-5 w-5" />,
      status: "completed"
    },
    {
      title: "View in Library",
      description: "Video appears in your video manager",
      icon: <Video className="h-5 w-5" />,
      status: "current"
    },
    {
      title: "Edit Settings",
      description: "Configure platform-specific settings",
      icon: <Settings className="h-5 w-5" />,
      status: "pending"
    },
    {
      title: "Publish",
      description: "Schedule or publish to platforms",
      icon: <Users className="h-5 w-5" />,
      status: "pending"
    }
  ];

  const mockVideos = [
    {
      id: "1",
      name: "My Awesome Video.mp4",
      size: "25.4 MB",
      duration: "2:15",
      status: "Ready",
      platforms: ["YouTube", "Instagram"],
      uploadedAt: "2 hours ago"
    },
    {
      id: "2", 
      name: "Tutorial Video.mp4",
      size: "45.2 MB",
      duration: "5:30",
      status: "Processing",
      platforms: ["YouTube"],
      uploadedAt: "1 day ago"
    }
  ];

  const simulateUpload = () => {
    setIsUploading(true);
    setUploadProgress(0);
    
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          toast({
            title: "Upload complete!",
            description: "Your video has been uploaded successfully.",
          });
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "current":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "pending":
        return <AlertCircle className="h-4 w-4 text-zinc-400" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Ready": return "bg-green-500";
      case "Processing": return "bg-yellow-500";
      case "Error": return "bg-red-500";
      default: return "bg-zinc-500";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-[32px] font-bold text-zinc-200 mb-2">UploaderX Demo</h1>
        <p className="text-zinc-400">Complete video upload and management workflow</p>
      </div>

      {/* Workflow Steps */}
      <Card className="bg-zinc-950/60 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-200">Workflow Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className={`p-2 rounded-full ${
                  step.status === "completed" ? "bg-green-500/20" :
                  step.status === "current" ? "bg-blue-500/20" :
                  "bg-zinc-500/20"
                }`}>
                  {getStatusIcon(step.status)}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-zinc-200">{step.title}</h3>
                  <p className="text-sm text-zinc-400">{step.description}</p>
                </div>
                {step.status === "current" && (
                  <Badge variant="outline" className="text-blue-400 border-blue-400">
                    Current
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upload Simulation */}
      <Card className="bg-zinc-950/60 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-200">Upload Simulation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button 
                onClick={simulateUpload}
                disabled={isUploading}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Uploading..." : "Simulate Upload"}
              </Button>
              <span className="text-sm text-zinc-400">
                Click to simulate video upload process
              </span>
            </div>
            
            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>Uploading video...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Video Library Demo */}
      <Card className="bg-zinc-950/60 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-200">Video Library</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockVideos.map((video) => (
              <div key={video.id} className="flex items-center gap-4 p-4 bg-zinc-900/40 rounded-lg">
                <div className="w-16 h-12 bg-zinc-800 rounded flex items-center justify-center">
                  <Play className="h-6 w-6 text-zinc-400" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-zinc-200 truncate">{video.name}</h3>
                  <div className="flex items-center gap-4 text-sm text-zinc-400 mt-1">
                    <span>{video.size}</span>
                    <span>{video.duration}</span>
                    <span>{video.uploadedAt}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className={`${getStatusColor(video.status)} text-white`}>
                    {video.status}
                  </Badge>
                  
                  <div className="flex gap-1">
                    {video.platforms.map(platform => (
                      <Badge key={platform} variant="outline" className="text-[11px]">
                        {platform}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Features Overview */}
      <Card className="bg-zinc-950/60 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-200">Key Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-zinc-200">Upload & Storage</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li>• Direct upload to Google Cloud Storage</li>
                <li>• Real-time progress tracking</li>
                <li>• User-specific folder structure</li>
                <li>• Automatic file validation</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-zinc-200">Video Management</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li>• Grid and list view modes</li>
                <li>• Search and filtering</li>
                <li>• Status tracking</li>
                <li>• Download and delete actions</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-zinc-200">Video Player</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li>• Full playback controls</li>
                <li>• Volume and seeking</li>
                <li>• Fullscreen support</li>
                <li>• Download functionality</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-zinc-200">Platform Integration</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li>• YouTube settings</li>
                <li>• Instagram configuration</li>
                <li>• Facebook options</li>
                <li>• Platform-specific editing</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default UploaderXDemo;

