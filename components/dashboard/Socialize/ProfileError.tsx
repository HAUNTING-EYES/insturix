import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import Link from "next/link"

export function ProfileError() {
  return (
    <div className="w-full max-w-md flex flex-col items-center z-10">
      <Card className="w-full bg-[#1a1a1f] border-[#2a2a35] text-center">
        <CardContent className="p-8">
          <div className="w-20 h-20 bg-[#23232a] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Search className="w-8 h-8 text-[#0e6b9c]" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-white">Profile Not Found</h2>
          <p className="text-gray-400 mb-6">This Socialize profile doesn&apos;t exist or has been removed.</p>
          <Link href="/">
            <Button className="bg-[#0e6b9c] hover:bg-[#0d5d87] text-white">Go Back Home</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
