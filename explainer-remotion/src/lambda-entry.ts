import {registerRoot} from 'remotion';
import {LambdaRoot} from './lambda-root';

// Remotion entry for the explainer per-video Lambda deploy (see ../lambda-render.mjs). Registers only Gen-Film.
registerRoot(LambdaRoot);
