import {
  createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1,
} from './native-media-final-render-preparation-worker-route-v1';
import {
  runNativeMediaFinalRenderPreparationProductRuntimeV1,
} from './native-media-final-render-preparation-product-runtime-v1';

type ProductRunnerV1 = typeof runNativeMediaFinalRenderPreparationProductRuntimeV1;
type ProductWorkerHandlerV1 = ReturnType<
  typeof createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1
>;

/** Binds the signed ingress to the sole exact-render product runtime. */
export function createNativeMediaFinalRenderPreparationProductRouteV1(
  input: Readonly<{
    run?: ProductRunnerV1;
    workerId?: string;
  }> = {},
): ProductWorkerHandlerV1 {
  return createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1({
    run: input.run ?? runNativeMediaFinalRenderPreparationProductRuntimeV1,
    ...(input.workerId === undefined ? {} : { workerId: input.workerId }),
  });
}
