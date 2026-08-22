"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Twitter, CheckCircle, XCircle, ExternalLink, Loader2, AlertTriangle, Key } from "lucide-react";

interface Permission {
    scope: string;
    label: string;
    icon: string;
    description: string;
    granted: boolean;
    missing: boolean;
}

interface TwitterStatus {
    connected: boolean;
    userName?: string;
    userId?: string;
    connectedAt?: Date;
    isExpired?: boolean;
    permissions?: Permission[];
    allPermissionsGranted?: boolean;
    grantedScopes?: string[];
    missingScopes?: string[];
}

export function TwitterPermissionsStatus() {
    const [status, setStatus] = useState<TwitterStatus | null>(null);
    const [loading, setLoading] = useState(true);

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
                permissions: data.permissions,
                allPermissionsGranted: data.allPermissionsGranted,
                grantedScopes: data.grantedScopes,
                missingScopes: data.missingScopes,
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

    if (loading) {
        return (
            <Card className="bg-zinc-950/60 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                </CardContent>
            </Card>
        );
    }

    if (!status?.connected || !status?.permissions) {
        return null;
    }

    return (
        <Card className="bg-zinc-950/60 border-zinc-800">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-sky-500" />
                        Twitter / X Permissions
                    </div>
                    {status.allPermissionsGranted ? (
                        <Badge className="bg-green-600 hover:bg-green-500 text-[11px]">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            All Granted
                        </Badge>
                    ) : (
                        <Badge variant="destructive" className="text-[11px]">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Missing Permissions
                        </Badge>
                    )}
                </CardTitle>
                <CardDescription className="text-[11px] text-zinc-400">
                    These permissions are required for full Twitter functionality
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Permission List */}
                <div className="space-y-2">
                    {status.permissions.map((perm) => (
                        <div
                            key={perm.scope}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition ${
                                perm.granted
                                    ? "bg-green-950/20 border-green-800/30"
                                    : "bg-red-950/20 border-red-800/30"
                            }`}
                        >
                            <div className="text-lg flex-shrink-0">{perm.icon}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-zinc-200">
                                        {perm.label}
                                    </p>
                                    {perm.granted ? (
                                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                    )}
                                </div>
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                    {perm.description}
                                </p>
                                <p className="text-[11px] text-zinc-500 font-mono mt-1">
                                    {perm.scope}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Warning if missing permissions */}
                {status.missingScopes && status.missingScopes.length > 0 && (
                    <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-lg">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-amber-200">
                                    Missing Permissions
                                </p>
                                <p className="text-[11px] text-amber-400/80 mt-1">
                                    The following permissions were not granted: {status.missingScopes.join(", ")}
                                </p>
                                <p className="text-[11px] text-amber-400/80 mt-2">
                                    Some features may not work correctly. Please reconnect your Twitter account.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Summary */}
                <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800">
                    <span>
                        {status.grantedScopes?.length || 0} / {status.permissions.length} permissions granted
                    </span>
                    {status.userName && (
                        <span>Connected as @{status.userName}</span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
