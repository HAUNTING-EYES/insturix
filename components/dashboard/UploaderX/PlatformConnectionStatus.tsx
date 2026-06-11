"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Youtube, Facebook, Instagram, Twitter, Linkedin, CheckCircle, XCircle, Link2 } from "lucide-react";

interface TwitterStatus {
  connected: boolean;
  userName?: string;
  isExpired?: boolean;
}

export function PlatformConnectionStatus() {
  const { user, isLoaded } = useUser();
  const [connections, setConnections] = useState({
    youtube: false,
    facebook: false,
    instagram: false,
    linkedin: false,
  });
  const [twitterStatus, setTwitterStatus] = useState<TwitterStatus>({ connected: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkConnections = async () => {
      try {
        // Check if we just returned from OAuth success
        const urlParams = new URLSearchParams(window.location.search);
        const isLinkedInSuccess = urlParams.get('success') === 'linkedin_connected';

        if (isLinkedInSuccess) {
          // Clean up the URL
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('success');
          window.history.replaceState({}, '', newUrl.toString());
          
          // Wait for database to update, then refresh LinkedIn status
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const liRes = await fetch('/api/services/uploaderx/linkedin/status');
          const liData = await liRes.json();
          
          setConnections(prev => ({ 
            ...prev, 
            linkedin: liData.connected || false,
          }));
          return;
        }

        // Check YouTube via Clerk external accounts
        if (isLoaded && user) {
          const googleAccount = user.externalAccounts.find(
            (acc) => acc.provider.includes("google")
          );
          const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
          const hasScope = googleAccount?.approvedScopes?.includes(SCOPE);
          setConnections(prev => ({ ...prev, youtube: hasScope !== false }));
        }

        // Check Facebook via API
        const fbRes = await fetch('/api/services/uploaderx/facebook/pages');
        const fbData = await fbRes.json();

        // Check Instagram via API
        let igData = { connected: false };
        try {
          const igRes = await fetch('/api/services/uploaderx/instagram/status');
          igData = await igRes.json();
        } catch (e) {
          // Instagram not connected or API error
        }

        // Check Twitter via API
        let twData: TwitterStatus = { connected: false };
        try {
          const twRes = await fetch('/api/services/uploaderx/twitter/status');
          twData = await twRes.json();
          setTwitterStatus({
            connected: twData.connected && !twData.isExpired,
            userName: twData.userName,
            isExpired: twData.isExpired,
          });
        } catch (e) {
          console.warn("[PlatformStatus] Twitter API error:", e);
        }

        // Check LinkedIn via API
        let liData = { connected: false };
        try {
          const liRes = await fetch('/api/services/uploaderx/linkedin/status');
          liData = await liRes.json();
        } catch (e) {
          console.warn("[PlatformStatus] LinkedIn API error:", e);
          
        }

        setConnections(prev => ({
          ...prev,
          facebook: fbData.connected || false,
          instagram: igData.connected || false,
          linkedin: liData.connected || false,
        }));
      } catch (error) {
        console.error("Failed to check connections:", error);
      } finally {
        setLoading(false);
      }
    };

    if (isLoaded) {
      checkConnections();
    }
  }, [isLoaded, user]);

  if (loading || !isLoaded) {
    return (
      <div className="text-sm text-zinc-400 animate-pulse">
        Checking platform connections...
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-4 p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
      {/* YouTube */}
      <div className="flex items-center gap-2">
        <Youtube className={`h-5 w-5 ${connections.youtube ? 'text-red-500' : 'text-zinc-500'}`} />
        <span className="text-sm text-zinc-400">YouTube</span>
        {connections.youtube ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
      </div>

      {/* Facebook */}
      <div className="flex items-center gap-2">
        <Facebook className={`h-5 w-5 ${connections.facebook ? 'text-blue-500' : 'text-zinc-500'}`} />
        <span className="text-sm text-zinc-400">Facebook</span>
        {connections.facebook ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
      </div>

      {/* Instagram */}
      <div className="flex items-center gap-2">
        <Instagram className={`h-5 w-5 ${connections.instagram ? 'text-pink-500' : 'text-zinc-500'}`} />
        <span className="text-sm text-zinc-400">Instagram</span>
        {connections.instagram ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
      </div>

      {/* Twitter */}
      <div className="flex items-center gap-2">
        <Twitter className={`h-5 w-5 ${twitterStatus.connected ? 'text-sky-500' : 'text-zinc-500'}`} />
        <span className="text-sm text-zinc-400">Twitter</span>
        {twitterStatus.connected ? (
          <>
            <CheckCircle className="h-4 w-4 text-green-500" />
            {twitterStatus.userName && (
              <span className="text-[11px] text-zinc-500">@{twitterStatus.userName}</span>
            )}
          </>
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
      </div>

      {/* LinkedIn */}
      <div className="flex items-center gap-2">
        <Linkedin className={`h-5 w-5 ${connections.linkedin ? 'text-blue-600' : 'text-zinc-500'}`} />
        <span className="text-sm text-zinc-400">LinkedIn</span>
        {connections.linkedin ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
      </div>

      {/* Connect Links */}
      <div className="flex-1" />

      {!connections.youtube && user && (
        <button
          onClick={async () => {
            try {
              await user.createExternalAccount({
                strategy: "oauth_google",
                redirectUrl: window.location.href,
                additionalScopes: ["https://www.googleapis.com/auth/youtube.upload"]
              });
            } catch (err) {
              // Clerk will handle redirect to profile
            }
          }}
          className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
        >
          <Link2 className="h-3 w-3" />
          Connect YouTube
        </button>
      )}

      {!connections.facebook && (
        <a
          href="/api/services/uploaderx/facebook/auth"
          className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Link2 className="h-3 w-3" />
          Connect Facebook
        </a>
      )}

      {/* Instagram */}
      {!connections.instagram && (
        <a
          href="/api/services/uploaderx/instagram/auth"
          className="text-[11px] text-pink-400 hover:underline flex items-center gap-1"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Link2 className="h-3 w-3" />
          Connect Instagram
        </a>
      )}

      {!twitterStatus.connected && (
        <a
          href="/api/services/uploaderx/twitter/auth"
          className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
        >
          <Link2 className="h-3 w-3" />
          Connect Twitter
        </a>
      )}

      {!connections.linkedin && (
        <a
          href="/api/services/uploaderx/linkedin/auth"
          className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
        >
          <Link2 className="h-3 w-3" />
          Connect LinkedIn
        </a>
      )}
    </div>
  );
}
