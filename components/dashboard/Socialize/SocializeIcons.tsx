import {
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
} from "lucide-react";
import { FaReddit, FaSnapchatGhost, FaTiktok, FaDiscord, FaTwitter } from "react-icons/fa";

import { getPlatformIconName } from "../../../lib/socialize/getPlatformIconName";

// Existing function for rendering the icon
export function getPlatformIcon(platform: string, isPreview = false) {
  const iconProps = {
    className: `text-white ${isPreview ? "w-4 h-4" : "w-5 h-5"}`,
  };
  const iconName = getPlatformIconName(platform);
  switch (iconName) {
    case "XTwitter":
      return <FaTwitter {...iconProps} />;
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
      return <FaDiscord {...iconProps} />;
    case "Reddit":
      return <FaReddit {...iconProps} />;
    case "Snapchat":
      return <FaSnapchatGhost {...iconProps} />;
    case "Tiktok":
      return <FaTiktok {...iconProps} />;
    default:
      return <LinkIcon {...iconProps} />;
  }
}
