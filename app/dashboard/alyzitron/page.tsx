"use client";

// Previous imports and component code remain the same until return statement
// Updating just the hero section within the existing layout

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Upload, Link2, History, ChevronRight, PlayCircle, CircleDot } from "lucide-react";
import Link from "next/link";
import { ProgressBar } from "@/components/ui/progress-bar";

type HistoryItem = {
  id: string;
  title: string;
  type: string;
  date: string;
  duration: string;
  status: "In Progress" | "Completed" | "Failed";
  score?: number;
  isUnread?: boolean;
};

export default function AlyzitronDashboard() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const videoTypes = [
    "Short Form",
    "Educational",
    "Entertainment",
    "Music",
    "Product Review",
    "Vlog"
  ];

  // Mock history data - replace with real data
  const [history, setHistory] = useState<HistoryItem[]>([
    {
      id: "1",
      title: "Product Launch Video",
      type: "Product Review",
      date: "March 16, 2024",
      duration: "2:45",
      status: "Completed",
      score: 92
    },
    {
      id: "2",
      title: "Tutorial: React Components",
      type: "Educational",
      date: "March 15, 2024",
      duration: "15:20",
      status: "Completed",
      score: 88
    }
  ]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    
    // Add new analysis to history
    const newAnalysis: HistoryItem = {
      id: Date.now().toString(),
      title: uploadedFile?.name || videoUrl,
      type: selectedType,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      duration: "--:--",
      status: "In Progress",
      isUnread: true
    };
    
    setHistory(prev => [newAnalysis, ...prev]);

    // Simulate API call
    setTimeout(() => {
      setHistory(prev => prev.map(item =>
        item.id === newAnalysis.id
          ? {
              ...item,
              status: "Completed",
              score: Math.floor(Math.random() * 20) + 80 // Random score between 80-100
            }
          : item
      ));
      setIsAnalyzing(false);
      setUploadedFile(null);
      setVideoUrl("");
      setSelectedType("");
    }, 3000);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          {/* Hero Section */}
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-100">
              Alyzitron
            </h1>
            <p className="mt-3 text-lg text-zinc-400 font-light">
              Transform your content with precise, data-driven insights
            </p>
          </div>

          {/* Upload/Link Section */}
          <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
            <CardContent className="pt-6">
              <Tabs defaultValue="upload" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-black/20">
                  <TabsTrigger value="upload" className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Video
                  </TabsTrigger>
                  <TabsTrigger value="link" className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900">
                    <Link2 className="mr-2 h-4 w-4" />
                    Video Link
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="mt-6">
                  <div className="border border-dashed border-zinc-800 rounded-lg p-10 text-center hover:border-zinc-700 transition-colors duration-300 group">
                    <Input
                      type="file"
                      className="hidden"
                      id="video-upload"
                      accept="video/*"
                      onChange={handleFileChange}
                    />
                    <label
                      htmlFor="video-upload"
                      className="flex flex-col items-center cursor-pointer"
                    >
                      <Upload className="h-12 w-12 mb-4 text-zinc-700 group-hover:text-zinc-500 transition-colors duration-300" />
                      <p className="text-zinc-500 group-hover:text-zinc-400 transition-colors duration-300 max-w-md mx-auto">
                        {uploadedFile ? uploadedFile.name : "Upload your video file or drag and drop here"}
                      </p>
                    </label>
                  </div>
                </TabsContent>
                <TabsContent value="link" className="mt-6">
                  <Input
                    type="url"
                    placeholder="Enter URL from YouTube or Instagram"
                    className="bg-black/20 border-zinc-800 focus:border-zinc-700 h-12"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                </TabsContent>
              </Tabs>

              {/* Video Type Selection */}
              <div className="mt-8">
                <label className="block text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
                  Content Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {videoTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`
                        px-4 py-3 rounded-lg text-sm font-medium tracking-wide transition-all duration-300
                        ${selectedType === type
                          ? 'bg-zinc-100 text-zinc-900'
                          : 'bg-black/20 text-zinc-400 hover:bg-black/40 hover:text-zinc-300'
                        }
                      `}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Analyze Button */}
              <div className="mt-8">
                <Button
                  size="lg"
                  className={`
                    w-full h-14 text-base font-medium tracking-wide
                    ${isAnalyzing || (!uploadedFile && !videoUrl) || !selectedType
                      ? 'bg-zinc-800 text-zinc-500'
                      : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                    }
                    transition-all duration-300
                  `}
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || (!uploadedFile && !videoUrl) || !selectedType}
                >
                  {isAnalyzing ? (
                    <div className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    "Begin Analysis"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Analysis */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-medium text-zinc-100">Recent Analysis</h2>
              <Button variant="ghost" className="text-zinc-400 hover:text-zinc-300">
                View All
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              {history.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/alyzitron/analysis/${item.id}`}
                  className="block"
                >
                  <Card className={`
                    relative bg-black/40 border-zinc-800 backdrop-blur-xl
                    hover:bg-black/50 transition-all duration-300
                    ${item.isUnread && item.status === 'Completed' ? 'ring-1 ring-zinc-500 shadow-lg shadow-black/20' : ''}
                  `}>
                    {item.status === 'In Progress' && (
                      <div className="absolute top-0 left-0 right-0">
                        <ProgressBar />
                      </div>
                    )}
                    <CardContent className="flex items-center p-4">
                      <div className="h-12 w-12 rounded-lg bg-black/40 flex items-center justify-center mr-4">
                        <PlayCircle className="h-6 w-6 text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-zinc-100 truncate">{item.title}</h3>
                          {item.isUnread && (
                            <CircleDot className="h-3 w-3 text-zinc-500 animate-pulse" />
                          )}
                        </div>
                        <p className="text-sm text-zinc-500">{item.type} • {item.duration}</p>
                      </div>
                      <div className="ml-4 flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium text-zinc-100">{item.status}</div>
                          <div className="text-sm text-zinc-500">{item.date}</div>
                        </div>
                        {item.status === "Completed" && item.score && (
                          <div className="h-10 w-10 rounded-lg bg-zinc-100 text-zinc-900 flex items-center justify-center font-medium">
                            {item.score}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Stats & Insights */}
        <div className="space-y-8">
          <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-zinc-100">Analytics Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="text-sm font-medium text-zinc-400 mb-1">Monthly Analysis</div>
                <div className="text-3xl font-semibold text-zinc-100">24</div>
                <div className="text-sm text-zinc-500 mt-1">Last 30 days</div>
              </div>
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="text-sm font-medium text-zinc-400 mb-1">Average Score</div>
                <div className="text-3xl font-semibold text-zinc-100">87.5</div>
                <div className="text-sm text-zinc-500 mt-1">Across all content</div>
              </div>
              <div className="p-4 bg-black/20 rounded-lg">
                <div className="text-sm font-medium text-zinc-400 mb-1">Processing Queue</div>
                <div className="text-3xl font-semibold text-zinc-100">
                  {history.filter(item => item.status === "In Progress").length}
                </div>
                <div className="text-sm text-zinc-500 mt-1">Videos in queue</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}