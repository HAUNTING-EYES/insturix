import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import Link from "next/link"

export function ProfileError() {
  return (
    <div className="w-full max-w-md flex flex-col items-center z-10">
      <Card className="w-full shadow-none border-transparent text-center" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
        <CardContent className="p-8">
          <div className="w-20 h-20 rounded-[12px] flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#1B1A18' }}>
            <Search className="w-8 h-8" style={{ color: '#D4A652' }} />
          </div>
          <h2 className="text-2xl font-medium mb-2" style={{ color: '#EAE9E5' }}>Profile Not Found</h2>
          <p className="mb-6" style={{ color: '#B5B2A8' }}>This public profile doesn&apos;t exist or has been removed.</p>
          <Link href="/">
            <Button className="rounded-[7px] border-none hover:opacity-90 transition-opacity" style={{ backgroundColor: '#D4A652', color: '#0B0B0A' }}>Go Back Home</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
