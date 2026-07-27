// Brand fonts, loaded via @remotion/google-fonts (handles delayRender internally, so text
// never pops in late). Plus Jakarta Sans = headings/body; JetBrains Mono = micro-labels.
import {loadFont as loadJakarta} from '@remotion/google-fonts/PlusJakartaSans';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

export const {fontFamily: jakarta} = loadJakarta('normal', {weights: ['400', '500', '800']});
export const {fontFamily: mono} = loadMono('normal', {weights: ['400', '500']});
