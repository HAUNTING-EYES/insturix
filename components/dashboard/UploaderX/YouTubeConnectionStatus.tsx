import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Youtube, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function YouTubeConnectionStatus() {
    const [isConnected, setIsConnected] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        const checkConnection = () => {
            const token = localStorage.getItem("youtube_token");
            setIsConnected(!!token);
            setIsChecking(false);
        };

        checkConnection();

        // Re-check every 30 seconds
        const interval = setInterval(checkConnection, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleConnect = () => {
        window.location.href = "/api/services/uploaderx/youtube/auth";
    };

    const handleDisconnect = () => {
        localStorage.removeItem("youtube_token");
        setIsConnected(false);
    };

    if (isChecking) {
        return null;
    }

    return (
        <Card className="bg-zinc-950/60 border-zinc-800">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Youtube className="h-4 w-4 text-red-500" />
                    YouTube Integration
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isConnected ? (
                            <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-sm text-green-200">Connected</span>
                            </>
                        ) : (
                            <>
                                <XCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm text-red-200">Not Connected</span>
                            </>
                        )}
                    </div>
                    <Badge variant={isConnected ? "default" : "destructive"} className="text-xs">
                        {isConnected ? "Active" : "Inactive"}
                    </Badge>
                </div>

                {isConnected ? (
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleConnect}
                            className="flex-1 h-8 text-xs"
                        >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Reconnect
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleDisconnect}
                            className="h-8 text-xs text-red-400 hover:text-red-300"
                        >
                            Disconnect
                        </Button>
                    </div>
                ) : (
                    <Button
                        size="sm"
                        onClick={handleConnect}
                        className="w-full h-8 text-xs bg-red-600 hover:bg-red-500"
                    >
                        <Youtube className="h-3 w-3 mr-1" />
                        Connect YouTube
                    </Button>
                )}

                <p className="text-xs text-zinc-400">
                    {isConnected
                        ? "Videos will auto-upload to YouTube when selected."
                        : "Connect your YouTube account to enable auto-uploads."}
                </p>
            </CardContent>
        </Card>
    );
}
