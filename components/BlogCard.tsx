import Link from "next/link";
import Image from "next/image";
import { blogPosts } from "@/components/data/blog-data";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BlogPage() {
  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">Our Blogs</h1>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {blogPosts.map((post) => (
            <Card key={post.id} className="flex flex-col overflow-hidden">
              <CardHeader className="p-0">
                <div className="relative h-48 w-full">
                  <Image
                    src={post.imageUrl || "/placeholder.svg"}
                    alt={post.title}
                    layout="fill"
                    objectFit="cover"
                    className="transition-transform duration-300 ease-in-out hover:scale-105"
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-4">
                <CardTitle className="mb-2">
                  <Link
                    href={`/resources/blogs/${post.id}`}
                    className="text-xl font-bold hover:text-blue-600 transition-colors"
                  >
                    {post.title}
                  </Link>
                </CardTitle>
                <p className="text-muted-foreground text-sm mb-4">
                  {post.excerpt}
                </p>
                <div className="flex items-center">
                  <Image
                    src={post.author.avatar || "/placeholder.svg"}
                    alt={post.author.name}
                    width={32}
                    height={32}
                    className="rounded-full mr-2"
                  />
                  <span className="text-sm font-medium">
                    {post.author.name}
                  </span>
                </div>
              </CardContent>
              <CardFooter className="p-4 pt-0">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/resources/blogs/${post.id}`}>Read More</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
