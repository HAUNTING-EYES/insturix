// Minimal Remotion entry for the craft loop's per-scene proof renders (see proof-root.tsx for why). agent-craft
// bundles THIS instead of src/index.ts so each re-bundle is tiny (seconds), not the whole app (~1-2 min).
import {registerRoot} from 'remotion';
import {ProofRoot} from './proof-root';

registerRoot(ProofRoot);
