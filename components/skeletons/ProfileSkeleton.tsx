import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export function ProfileSkeleton() {
  return (
    <div className="w-full max-w-md flex flex-col items-center z-10 gap-4 animate-pulse">
      {/* Profile header skeleton with banner */}
      <Card className="w-full bg-[#1a1a1f] border-[#2a2a35] overflow-hidden">
        <Skeleton className="h-24 rounded-none" />
        <CardContent className="p-6 relative">
          <Skeleton className="w-24 h-24 rounded-full absolute -top-12 left-6" />
          <div className="mt-12">
            <Skeleton className="h-7 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3 mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* Links skeleton */}
      <div className="w-full space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="w-full bg-[#1a1a1f] border-[#2a2a35]">
            <CardContent className="p-4 flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-5 w-1/3 mb-1" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="w-5 h-5 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
