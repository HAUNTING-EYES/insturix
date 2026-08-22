"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Instagram, CheckCircle, XCircle, Settings, ExternalLink, Loader2 } from "lucide-react";

interface InstagramAccount {
    instagramAccountId: string;
    instagramUsername: string;
}

interface InstagramStatus {
    connected: boolean;
    userName?: string;
    accounts: InstagramAccount[];
}

export function InstagramConnectionStatus() {
    const [status, setStatus] = useState<InstagramStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/services/uploaderx/instagram/status");
            const data = await res.json();
            setStatus({
                connected: data.connected,
                userName: data.userName,
                accounts: data.accounts || [],
            });
        } catch (err) {
            console.error("Failed to fetch Instagram status:", err);
            setStatus({ connected: false, accounts: [] });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleConnect = () => {
        window.location.href = "/api/services/uploaderx/instagram/auth";
    };

    const handleDisconnect = async () => {
        setDisconnecting(true);
        try {
            await fetch("/api/services/uploaderx/instagram/accounts", { method: "DELETE" });
            setStatus({ connected: false, accounts: [] });
        } catch (err) {
            console.error("Failed to disconnect Instagram:", err);
        } finally {
            setDisconnecting(false);
        }
    };

    if (loading) {
        return (
            <Card className="bg-zinc-950/60 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-pink-400" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-zinc-950/60 border-zinc-800">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Instagram className="h-4 w-4 text-pink-500" />
                    Instagram Integration
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
                        {status.accounts.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-[11px] text-zinc-500">Accounts:</p>
                                {status.accounts.map((account) => (
                                    <div key={account.instagramAccountId} className="text-[11px] text-zinc-300 pl-2 flex flex-col gap-0.5">
                                        <div className="flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 inline-block" />
                                            <span className="font-medium">@{account.instagramUsername}</span>
                                        </div>
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
                        className="w-full h-8 text-[11px] bg-pink-600 hover:bg-pink-500"
                    >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Connect Instagram
                    </Button>
                )}

                <p className="text-[11px] text-zinc-500">
                    Connect your Instagram account to upload Reels directly.
                </p>
            </CardContent>
        </Card>
    );
}