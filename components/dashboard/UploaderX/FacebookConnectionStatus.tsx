"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Facebook, CheckCircle, XCircle, Settings, ExternalLink, Loader2 } from "lucide-react";

interface FacebookPage {
    pageId: string;
    pageName: string;
}

interface FacebookStatus {
    connected: boolean;
    userName?: string;
    pages: FacebookPage[];
}

export function FacebookConnectionStatus() {
    const [status, setStatus] = useState<FacebookStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/services/uploaderx/facebook/pages");
            const data = await res.json();
            setStatus({
                connected: data.connected,
                userName: data.userName,
                pages: data.pages || [],
            });
        } catch (err) {
            console.error("Failed to fetch Facebook status:", err);
            setStatus({ connected: false, pages: [] });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleConnect = () => {
        window.location.href = "/api/services/uploaderx/facebook/auth";
    };

    const handleDisconnect = async () => {
        setDisconnecting(true);
        try {
            await fetch("/api/services/uploaderx/facebook/pages", { method: "DELETE" });
            setStatus({ connected: false, pages: [] });
        } catch (err) {
            console.error("Failed to disconnect Facebook:", err);
        } finally {
            setDisconnecting(false);
        }
    };

    if (loading) {
        return (
            <Card className="bg-zinc-950/60 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-zinc-950/60 border-zinc-800">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Facebook className="h-4 w-4 text-blue-500" />
                    Facebook Integration
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {status?.connected ? (
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
                </div>

                {status?.connected && (
                    <>
                        <p className="text-[11px] text-zinc-400 truncate">
                            Logged in as: <span className="text-zinc-300">{status.userName}</span>
                        </p>
                        {status.pages.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-[11px] text-zinc-500">Pages:</p>
                                {status.pages.map((page) => (
                                    <div key={page.pageId} className="text-[11px] text-zinc-300 pl-2 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                                        {page.pageName}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {status?.connected ? (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="w-full h-8 text-[11px] border-zinc-700 hover:bg-zinc-800"
                    >
                        {disconnecting ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                            <Settings className="h-3 w-3 mr-1" />
                        )}
                        {disconnecting ? "Disconnecting..." : "Disconnect"}
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        onClick={handleConnect}
                        className="w-full h-8 text-[11px] bg-blue-600 hover:bg-blue-500"
                    >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Connect Facebook
                    </Button>
                )}

                <p className="text-[11px] text-zinc-500">
                    Connect a Facebook Page to upload videos directly.
                </p>
            </CardContent>
        </Card>
    );
}
