export function bindAbortToPageLifecycle(
  controller: AbortController,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  let detached = false;
  const abortForPageTeardown = () => controller.abort();
  window.addEventListener("pagehide", abortForPageTeardown, { once: true });

  return () => {
    if (detached) return;
    detached = true;
    window.removeEventListener("pagehide", abortForPageTeardown);
  };
}
