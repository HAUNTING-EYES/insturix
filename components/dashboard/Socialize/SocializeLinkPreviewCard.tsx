"use client"

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Share2 } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { SocializePreview } from "./PreviewSocialize"

interface LinkPreview {
  title: string
  description: string
  image: string | null
  url: string
}

interface ILink {
  platform: string
  url: string
}

interface SocializeLinkPreviewCardProps {
  selectedLinkIndex: number | null
  isPreviewLoading: boolean
  previewData: LinkPreview | null
  userLinks: ILink[]
  userBio: string
  userLogo: string | null | undefined
  userName: string | undefined
}

export function SocializeLinkPreviewCard({
  selectedLinkIndex,
  isPreviewLoading,
  previewData,
  userLinks,
  userBio,
  userLogo,
  userName,
}: SocializeLinkPreviewCardProps) {
  return (
    <Card className="bg-black/30 border-[#0e6b9c]/30 backdrop-blur-sm h-full">
      <CardHeader>
        <CardTitle className="text-lg text-white">Link Preview</CardTitle>
        <CardDescription>Select a link to see how it appears to visitors</CardDescription>
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
            <div className="rounded-lg overflow-hidden border border-[#0e6b9c]/30">
              <div className="aspect-video bg-gray-800 relative overflow-hidden">
                {previewData?.image ? (
                  <Image
                    src={previewData.image || "/placeholder.svg"}
                    alt={previewData.title || "Link preview"}
                    width={500}
                    height={300}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-900">
                    <Share2 className="w-10 h-10 text-gray-700" />
                  </div>
                )}
              </div>
              <div className="p-4 bg-black/60">
                <h3 className="font-medium text-white mb-2 line-clamp-2">
                  {previewData?.title || "No title available"}
                </h3>
                <p className="text-gray-300 text-sm line-clamp-3">
                  {previewData?.description || "No description available"}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <Badge variant="outline" className="text-xs text-gray-400 truncate max-w-[180px]">
                    {userLinks?.[selectedLinkIndex]?.platform}
                  </Badge>
                  <Button variant="link" size="sm" className="text-[#0e6b9c] hover:text-[#0e6b9c]/80 p-0" asChild>
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
            <div className="w-16 h-16 bg-[#0e6b9c]/20 rounded-full flex items-center justify-center mb-4">
              <ExternalLink className="w-8 h-8 text-[#0e6b9c]" />
            </div>
            <h3 className="text-white font-medium mb-2">No link selected</h3>
            <p className="text-gray-400 text-sm">
              Click on a link from your list to see a preview of how it will appear to your visitors
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t border-[#0e6b9c]/30 pt-4">
        <SocializePreview
          logo={userLogo || null}
          profileTitle={userName || ""}
          bio={userBio || ""}
          links={userLinks || []}
        />
      </CardFooter>
    </Card>
  )
}
