import {
    Twitter,
    Instagram,
    Github,
    Linkedin,
    Youtube,
    Facebook,
    Globe,
    Mail,
    Twitch,
    Music,
    LinkIcon,
    MessageSquare,
    BookOpen,
    Rss,
  } from "lucide-react"
  
  export function getPlatformIcon(platform: string) {
    const iconProps = { className: "w-5 h-5 text-[#42a5f5]" }
  
    const normalizedPlatform = platform.toLowerCase()
  
    if (normalizedPlatform.includes("twitter") || normalizedPlatform.includes("x.com")) {
      return <Twitter {...iconProps} />
    }
    if (normalizedPlatform.includes("instagram")) {
      return <Instagram {...iconProps} />
    }
    if (normalizedPlatform.includes("github")) {
      return <Github {...iconProps} />
    }
    if (normalizedPlatform.includes("linkedin")) {
      return <Linkedin {...iconProps} />
    }
    if (normalizedPlatform.includes("youtube")) {
      return <Youtube {...iconProps} />
    }
    if (normalizedPlatform.includes("facebook")) {
      return <Facebook {...iconProps} />
    }
    if (normalizedPlatform.includes("twitch")) {
      return <Twitch {...iconProps} />
    }
    if (normalizedPlatform.includes("spotify") || normalizedPlatform.includes("apple music")) {
      return <Music {...iconProps} />
    }
    if (normalizedPlatform.includes("email") || normalizedPlatform.includes("mail")) {
      return <Mail {...iconProps} />
    }
    if (normalizedPlatform.includes("discord") || normalizedPlatform.includes("chat")) {
      return <MessageSquare {...iconProps} />
    }
    if (normalizedPlatform.includes("blog") || normalizedPlatform.includes("medium")) {
      return <BookOpen {...iconProps} />
    }
    if (normalizedPlatform.includes("rss") || normalizedPlatform.includes("feed")) {
      return <Rss {...iconProps} />
    }
    if (normalizedPlatform.includes("website")) {
      return <Globe {...iconProps} />
    }
  
    // Default icon
    return <LinkIcon {...iconProps} />
  }
  