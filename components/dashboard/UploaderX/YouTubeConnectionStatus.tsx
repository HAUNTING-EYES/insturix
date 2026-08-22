import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Youtube, CheckCircle, XCircle, Settings, ExternalLink } from "lucide-react";
import { useUser, useClerk } from "@clerk/nextjs";

export function YouTubeConnectionStatus() {
    const { user, isLoaded } = useUser();
    const { openUserProfile } = useClerk();

    const googleAccount = user?.externalAccounts.find(
        (acc) => acc.provider === "google" || (acc.provider as string) === "oauth_google" || acc.verification?.strategy === "oauth_google"
    );

    const isConnected = !!googleAccount;
    // Check for the upload scope.
    const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
    const hasScope = googleAccount?.approvedScopes?.includes(SCOPE);

    const handleConnect = async () => {
        if (hasScope === false) {
            alert("⚠️ SECURITY ACTION REQUIRED\n\nTo fix the missing permissions, you must manually reset the connection:\n\n1. The settings window will open.\n2. Find 'Google' in Connected Accounts.\n3. Click 'Remove' or 'Disconnect'.\n4. Click 'Connect Account' and link Google again.\n\nMake sure to check the 'Manage YouTube Videos' box!");
            openUserProfile();
        } else {
            // Standard connect for new users
            try {
                await user?.createExternalAccount({
                    strategy: "oauth_google",
                    redirectUrl: window.location.href,
                    additionalScopes: [SCOPE]
                });
            } catch (err) {
                openUserProfile();
            }
        }
    };

    if (!isLoaded) {
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
                            hasScope !== false ? ( // Default to true if approvedScopes is undefined to avoid false positives
                                <>
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                    <span className="text-sm text-green-200">Connected</span>
                                </>
                            ) : (
                                <>
                                    <XCircle className="h-4 w-4 text-yellow-500" />
                                    <span className="text-sm text-yellow-200">Missing Permissions</span>
                                </>
                            )
                        ) : (
                            <>
                                <XCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm text-red-200">Not Connected</span>
                            </>
                        )}
                    </div>
                </div>

                {isConnected && googleAccount && (
                    <p className="text-[11px] text-zinc-400 truncate">
                        Linked as: <span className="text-zinc-300">{googleAccount.username || googleAccount.emailAddress}</span>
                    </p>
                )}

                {isConnected && hasScope === false && (
                    <div className="p-2 bg-yellow-900/20 border border-yellow-500/30 rounded text-[11px] text-yellow-200">
                        You are connected, but missing permission to upload videos.
                    </div>
                )}

                {isConnected ? (
                    hasScope === false ? (
                        <Button
                            size="sm"
                            onClick={handleConnect}
                            className="w-full h-8 text-[11px] bg-yellow-600 hover:bg-yellow-500"
                        >
                            <Settings className="h-3 w-3 mr-1" />
                            Fix Permissions
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openUserProfile()}
                            className="w-full h-8 text-[11px] border-zinc-700 hover:bg-zinc-800"
                        >
                            <Settings className="h-3 w-3 mr-1" />
                            Manage Connection
                        </Button>
                    )
                ) : (
                    <Button
                        size="sm"
                        onClick={handleConnect}
                        className="w-full h-8 text-[11px] bg-red-600 hover:bg-red-500"
                    >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Connect YouTube
                    </Button>
                )}

                <p className="text-[11px] text-zinc-500">
                    To enable uploads, ensure your Google account has YouTube permissions in your Clerk profile.
                </p>
            </CardContent>
        </Card>
    );
}
