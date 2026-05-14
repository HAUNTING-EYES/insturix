"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Twitter, CheckCircle, XCircle, ExternalLink, Loader2, LogOut } from "lucide-react";

interface TwitterStatus {
    connected: boolean;
    userName?: string;
    userId?: string;
    connectedAt?: Date;
    isExpired?: boolean;
}

export function TwitterConnectionStatus() {
    const [status, setStatus] = useState<TwitterStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/services/uploaderx/twitter/status");
            const data = await res.json();
            setStatus({
                connected: data.connected,
                userName: data.userName,
                userId: data.userId,
                connectedAt: data.connectedAt,
                isExpired: data.isExpired,
            });
        } catch (err) {
            console.error("Failed to fetch Twitter status:", err);
            setStatus({ connected: false });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleConnect = () => {
        window.location.href = "/api/services/uploaderx/twitter/auth";
    };

    const handleDisconnect = async () => {
        setDisconnecting(true);
        try {
            await fetch("/api/services/uploaderx/twitter/reset", { method: "POST" });
            setStatus({ connected: false });
        } catch (err) {
            console.error("Failed to disconnect Twitter:", err);
        } finally {
            setDisconnecting(false);
        }
    };

    if (loading) {
        return (
            <Card className="bg-zinc-950/60 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-zinc-950/60 border-zinc-800">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Twitter className="h-4 w-4 text-sky-500" />
                    Twitter / X Integration
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {status?.connected && !status?.isExpired ? (
                            <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-sm text-green-200">Connected</span>
                            </>
                        ) : (
                            <>
                                <XCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm text-red-200">
                                    {status?.isExpired ? "Token Expired" : "Not Connected"}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {status?.connected && !status?.isExpired && (
                    <>
                        {status.userName ? (
                            <p className="text-[11px] text-zinc-400 truncate">
                                Logged in as: <span className="text-zinc-300 font-medium">@{status.userName}</span>
                            </p>
                        ) : (
                            <p className="text-[11px] text-zinc-400 truncate">
                                Connected successfully
                            </p>
                        )}
                    </>
                )}

                {status?.connected && !status?.isExpired ? (
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
                            <LogOut className="h-3 w-3 mr-1" />
                        )}
                        {disconnecting ? "Disconnecting..." : "Disconnect"}
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        onClick={handleConnect}
                        className="w-full h-8 text-[11px] bg-sky-600 hover:bg-sky-500"
                    >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Connect Twitter
                    </Button>
                )}

                <p className="text-[11px] text-zinc-500">
                    Connect a Twitter account to post videos directly.
                </p>
            </CardContent>
        </Card>
    );
}
