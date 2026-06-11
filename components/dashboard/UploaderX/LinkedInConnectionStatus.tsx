"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Linkedin, CheckCircle, AlertCircle, Loader2, Building2, User } from "lucide-react";

interface LinkedInConnectionStatusProps {
  onConnectionChange?: (connected: boolean) => void;
}

interface LinkedInStatus {
  connected: boolean;
  canPostPersonal?: boolean;
  canPostOrganization?: boolean;
  canPost?: boolean;
  message?: string;
  missingScopes?: string[];
  needsReconnect?: boolean;
  userName?: string;
  userId?: string;
  organizations?: Array<{ id: string; name: string; vanityName: string }>;
  isExpired?: boolean;
  connectedAt?: string;
  loading: boolean;
}

export function LinkedInConnectionStatus({ onConnectionChange }: LinkedInConnectionStatusProps) {
  const [status, setStatus] = useState<LinkedInStatus>({
    connected: false,
    canPostPersonal: false,
    canPostOrganization: false,
    canPost: false,
    message: undefined,
    missingScopes: [],
    needsReconnect: false,
    userName: undefined,
    userId: undefined,
    organizations: [],
    isExpired: false,
    connectedAt: undefined,
    loading: true,
  });

  const { toast } = useToast();

  const checkStatus = async () => {
    try {
      setStatus(prev => ({ ...prev, loading: true }));

      const res = await fetch("/api/services/uploaderx/linkedin/status");
      
      const data = await res.json();

      if (data.success) {
        const isConnected = !!data.connected;
        
        const newStatus = {
          connected: isConnected,
          canPostPersonal: !!data.canPostPersonal,
          userName: data.userName,
          userId: data.userId,
          organizations: data.organizations || [],
          message: data.message,
          missingScopes: data.missingScopes || [],
          needsReconnect: !!data.needsReconnect,
          isExpired: !!data.isExpired,
          canPost: !!data.canPost,
          canPostOrganization: !!data.canPostOrganization,
          connectedAt: data.connectedAt,
          loading: false,
        };
        setStatus(newStatus);

        onConnectionChange?.(isConnected);
      } else {
        console.error("[LinkedInUI] API returned success: false", data);
        setStatus({
          connected: false,
          canPostPersonal: false,
          canPostOrganization: false,
          canPost: false,
          message: undefined,
          missingScopes: [],
          needsReconnect: false,
          userName: undefined,
          userId: undefined,
          organizations: [],
          isExpired: false,
          connectedAt: undefined,
          loading: false,
        });
      }
    } catch (error) {
      console.error("❌ LinkedIn status check error:", error);
      setStatus({
        connected: false,
        canPostPersonal: false,
        canPostOrganization: false,
        canPost: false,
        message: undefined,
        missingScopes: [],
        needsReconnect: false,
        userName: undefined,
        userId: undefined,
        organizations: [],
        isExpired: false,
        connectedAt: undefined,
        loading: false,
      });
    }
  };

  useEffect(() => {
    const handleLinkedInPopupMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.source !== "uploaderx-linkedin-oauth") {
        return;
      }

      const payload = event.data.payload || {};
      if (payload.success) {
        toast({
          title: "LinkedIn connected!",
          description: "You can now post content to LinkedIn.",
        });
      } else {
        toast({
          title: "LinkedIn Connection Error",
          description: payload.message || "Failed to connect LinkedIn.",
          variant: "destructive",
        });
      }

      checkStatus();
    };

    window.addEventListener("message", handleLinkedInPopupMessage);

    // Check if we just returned from OAuth success
    const urlParams = new URLSearchParams(window.location.search);
    const isLinkedInSuccess = urlParams.get('success') === 'linkedin_connected';
    const isLinkedInError = urlParams.get('error') === 'linkedin_connected';

    if (isLinkedInSuccess) {
      // Clean up the URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('success');
      newUrl.searchParams.delete('t'); // Remove timestamp param
      window.history.replaceState({}, '', newUrl.toString());
      
      // Add a longer delay to ensure database is updated after OAuth
      setTimeout(() => {
        checkStatus();
      }, 2000);
    } else if (isLinkedInError) {
      // Clean up error from URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('error');
      window.history.replaceState({}, '', newUrl.toString());
      setStatus({
        connected: false,
        canPostPersonal: false,
        canPostOrganization: false,
        canPost: false,
        message: undefined,
        missingScopes: [],
        needsReconnect: false,
        userName: undefined,
        userId: undefined,
        organizations: [],
        isExpired: false,
        connectedAt: undefined,
        loading: false,
      });
    } else {
      checkStatus();
    }

    return () => {
      window.removeEventListener("message", handleLinkedInPopupMessage);
    };
  }, []);

  const handleConnect = () => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popup = window.open(
      '/api/services/uploaderx/linkedin/auth',
      'LinkedIn Connect',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );
    
    const checkPopup = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopup);
        checkStatus();
      }
    }, 500);
  };

  const handleDisconnect = async () => {
    try {
      // Note: LinkedIn doesn't have a direct disconnect API
      // We'll just remove tokens from our database
      const res = await fetch("/api/services/uploaderx/linkedin/status", {
        method: "DELETE",
      });

      if (res.ok) {
        toast({
          title: "LinkedIn Disconnected",
          description: "Your LinkedIn account has been disconnected.",
        });
        checkStatus();
      } else {
        throw new Error("Failed to disconnect");
      }
    } catch (error) {
      toast({
        title: "Disconnect Failed",
        description: "Failed to disconnect LinkedIn account.",
        variant: "destructive",
      });
    }
  };

  if (status.loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            LinkedIn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">Checking connection...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Linkedin className="h-4 w-4 text-blue-600" />
          LinkedIn
          {status.connected && !status.isExpired && (
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
          {status.isExpired && (
            <Badge variant="destructive">
              <AlertCircle className="h-3 w-3 mr-1" />
              Expired
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.connected ? (
          <>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-zinc-500" />
              <span className="text-sm">{status.userName || 'LinkedIn account connected'}</span>
            </div>

            {status.organizations && status.organizations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-zinc-500" />
                  <span className="text-sm font-medium">Organizations ({status.organizations.length})</span>
                </div>
                <div className="ml-6 space-y-1">
                  {status.organizations.slice(0, 3).map((org) => (
                    <div key={org.id} className="text-[11px] text-zinc-600">
                      {org.name}
                    </div>
                  ))}
                  {status.organizations.length > 3 && (
                    <div className="text-[11px] text-zinc-500">
                      +{status.organizations.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {!status.canPostPersonal && (
              <p className="text-[11px] text-yellow-500">
                {status.message || "Personal posting is unavailable until profile permissions are granted."}
              </p>
            )}
            {!!status.missingScopes?.length && (
              <p className="text-[11px] text-zinc-500">
                Missing LinkedIn scopes: {status.missingScopes.join(", ")}
              </p>
            )}
            {status.connectedAt && (
              <p className="text-[11px] text-zinc-500">
                Connected {new Date(status.connectedAt).toLocaleDateString()}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={checkStatus}
                disabled={status.loading}
              >
                Refresh
              </Button>
              {!status.canPostPersonal && (
                <Button
                  size="sm"
                  onClick={handleConnect}
                >
                  Reconnect
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              Connect your LinkedIn account to post videos, images, and documents.
            </p>
            <Button onClick={handleConnect} className="w-full">
              <Linkedin className="h-4 w-4 mr-2" />
              Connect LinkedIn
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
