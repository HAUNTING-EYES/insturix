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

export function getPlatformIcon(platform: string) {
  const iconProps = { className: "w-5 h-5 text-white" };

  const normalizedPlatform = platform.toLowerCase();

  switch (normalizedPlatform) {
    case "twitter":
    case "x":
      return <Twitter {...iconProps} />;
    case "instagram":
      return <Instagram {...iconProps} />;
    case "facebook":
      return <Facebook {...iconProps} />;
    case "linkedin":
      return <Linkedin {...iconProps} />;
    case "github":
      return <Github {...iconProps} />;
    case "youtube":
      return <Youtube {...iconProps} />;
    case "twitch":
      return <Twitch {...iconProps} />;
    case "website":
      return <Globe {...iconProps} />;
    case "email":
      return <Mail {...iconProps} />;
    case "spotify":
      return <Spotify {...iconProps} />;
    case "music":
      return <Music {...iconProps} />;
    case "dribbble":
      return <Dribbble {...iconProps} />;
    case "figma":
      return <Figma {...iconProps} />;
    case "codepen":
      return <Codepen {...iconProps} />;
    case "slack":
      return <Slack {...iconProps} />;
    case "discord":
      return <Discord {...iconProps} />;
    default:
      return <LinkIcon {...iconProps} />;
  }
}
