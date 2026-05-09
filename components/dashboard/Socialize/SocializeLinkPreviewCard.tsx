"use client"

import Image from "next/image";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SocializePreview } from "./PreviewSocialize"

interface LinkPreview {
  title: string
  description: string
  image: string | null
  url: string
}

import type { SocializeLink } from "@/schemas/Socialize";

const formatDomainName = (urlString?: string) => {
  if (!urlString) return "Website";
  try {
    const parsedUrl = new URL(urlString);
    let hostname = parsedUrl.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    return hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    return urlString;
  }
};

interface SocializeLinkPreviewCardProps {
  selectedLinkIndex: number | null
  isPreviewLoading: boolean
  previewData: LinkPreview | null
  userLinks: SocializeLink[]
  userBio: string
  userLogo: string | null | undefined
  userName: string | undefined
  userBanner?: import("@/schemas/Socialize").BannerConfig
}

export function SocializeLinkPreviewCard({
  selectedLinkIndex,
  isPreviewLoading,
  previewData,
  userLinks,
  userBio,
  userLogo,
  userName,
  userBanner,
}: SocializeLinkPreviewCardProps) {
  return (
    <Card className="border-none shadow-none h-full" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
      <CardHeader>
        <CardTitle className="text-lg font-medium" style={{ color: '#EAE9E5' }}>Link Preview</CardTitle>
        <CardDescription style={{ color: '#B5B2A8' }}>Select a link to see how it appears to visitors</CardDescription>
      </CardHeader>
      <CardContent>
        {selectedLinkIndex !== null ? (
          isPreviewLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-[200px] w-full bg-gray-800" />
              <Skeleton className="h-4 w-3/4 bg-gray-800" />
              <Skeleton className="h-4 w-full bg-gray-800" />
              <Skeleton className="h-4 w-1/2 bg-gray-800" />
            </div>
          ) : (
            <div className="rounded-[12px] overflow-hidden" style={{ backgroundColor: '#1B1A18' }}>
              {!!previewData?.image && (
                <div className="aspect-video bg-gray-800 relative overflow-hidden">
                  <Image
                    src={previewData.image}
                    alt={previewData.title || "Link preview"}
                    width={500}
                    height={300}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4" style={{ backgroundColor: '#1B1A18' }}>
                {(!previewData?.title && !previewData?.description) ? (
                  <h3 className="font-medium mb-2 line-clamp-2 break-all" style={{ color: '#EAE9E5' }}>
                    {formatDomainName(userLinks?.[selectedLinkIndex]?.url)}
                  </h3>
                ) : (
                  <>
                    <h3 className="font-medium mb-2 line-clamp-2" style={{ color: '#EAE9E5' }}>
                      {previewData?.title || "No title available"}
                    </h3>
                    <p className="text-sm line-clamp-3" style={{ color: '#B5B2A8' }}>
                      {previewData?.description || "No description available"}
                    </p>
                  </>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <Badge variant="outline" className="text-xs truncate max-w-[180px] capitalize border-social-line" style={{ color: '#B5B2A8' }}>
                    {userLinks?.[selectedLinkIndex]?.platform}
                  </Badge>
                  <Button variant="link" size="sm" className="hover:opacity-80 p-0 transition-opacity" style={{ color: '#D4A652' }} asChild>
                    <a
                      href={userLinks?.[selectedLinkIndex]?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center"
                    >
                      Visit
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#1B1A18' }}>
              <ExternalLink className="w-8 h-8" style={{ color: '#D4A652' }} />
            </div>
            <h3 className="font-medium mb-2" style={{ color: '#EAE9E5' }}>No link selected</h3>
            <p className="text-sm" style={{ color: '#B5B2A8' }}>
              Click on a link from your list to see a preview of how it will appear to your visitors
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-4 border-t border-transparent">
        <SocializePreview
          logo={userLogo || null}
          profileTitle={userName || ""}
          bio={userBio || ""}
          links={userLinks || []}
          banner={userBanner}
        />
      </CardFooter>
    </Card>
  )
}
