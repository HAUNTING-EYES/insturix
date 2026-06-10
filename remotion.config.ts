/**
 * Remotion Cloud Run Configuration
 */
import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind';

// Enable TailwindCSS
Config.overrideWebpackConfig((currentConfiguration) => {
  return enableTailwind(currentConfiguration);
});

// Set the output format
Config.setCodec('h264');

