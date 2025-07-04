import {
  Twitter,
  Instagram,
  Facebook,
  Linkedin,
  Github,
  Youtube,
  Twitch,
  Globe,
  Mail,
  Music,
  AirplayIcon as Spotify,
  LinkIcon,
  Dribbble,
  Figma,
  Codepen,
  Slack,
  DiscIcon as Discord,
} from "lucide-react";

export function getPlatformIconName(platform: string): string {
  const normalizedPlatform = platform.toLowerCase();
  switch (normalizedPlatform) {
    case "twitter":
    case "x":
      return "Twitter";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "linkedin":
      return "Linkedin";
    case "github":
      return "Github";
    case "youtube":
      return "Youtube";
    case "twitch":
      return "Twitch";
    case "website":
      return "Globe";
    case "email":
      return "Mail";
    case "spotify":
      return "Spotify";
    case "music":
      return "Music";
    case "dribbble":
      return "Dribbble";
    case "figma":
      return "Figma";
    case "codepen":
      return "Codepen";
    case "slack":
      return "Slack";
    case "discord":
      return "Discord";
    default:
      return "LinkIcon";
  }
}

// Existing function for rendering the icon
export function getPlatformIcon(platform: string, isPreview = false) {
  const iconProps = {
    className: `text-white ${isPreview ? "w-4 h-4" : "w-5 h-5"}`,
  };
  const iconName = getPlatformIconName(platform);
  switch (iconName) {
    case "Twitter":
      return <Twitter {...iconProps} />;
    case "Instagram":
      return <Instagram {...iconProps} />;
    case "Facebook":
      return <Facebook {...iconProps} />;
    case "Linkedin":
      return <Linkedin {...iconProps} />;
    case "Github":
      return <Github {...iconProps} />;
    case "Youtube":
      return <Youtube {...iconProps} />;
    case "Twitch":
      return <Twitch {...iconProps} />;
    case "Globe":
      return <Globe {...iconProps} />;
    case "Mail":
      return <Mail {...iconProps} />;
    case "Spotify":
      return <Spotify {...iconProps} />;
    case "Music":
      return <Music {...iconProps} />;
    case "Dribbble":
      return <Dribbble {...iconProps} />;
    case "Figma":
      return <Figma {...iconProps} />;
    case "Codepen":
      return <Codepen {...iconProps} />;
    case "Slack":
      return <Slack {...iconProps} />;
    case "Discord":
      return <Discord {...iconProps} />;
    default:
      return <LinkIcon {...iconProps} />;
  }
}
