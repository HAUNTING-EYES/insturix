export function getPlatformIconName(platform: string): string {
  const normalizedPlatform = (platform || '').toLowerCase();
  switch (normalizedPlatform) {
    case 'twitter':
    case 'x':
      return 'XTwitter';
    case 'instagram':
      return 'Instagram';
    case 'facebook':
      return 'Facebook';
    case 'linkedin':
      return 'Linkedin';
    case 'github':
      return 'Github';
    case 'youtube':
      return 'Youtube';
    case 'twitch':
      return 'Twitch';
    case 'website':
      return 'Globe';
    case 'email':
      return 'Mail';
    case 'spotify':
      return 'Spotify';
    case 'music':
      return 'Music';
    case 'dribbble':
      return 'Dribbble';
    case 'figma':
      return 'Figma';
    case 'codepen':
      return 'Codepen';
    case 'slack':
      return 'Slack';
    case 'discord':
      return 'Discord';
    case 'reddit':
      return 'Reddit';
    case 'snapchat':
      return 'Snapchat';
    case 'tiktok':
      return 'Tiktok';
    default:
      return 'LinkIcon';
  }
}

export default getPlatformIconName;
