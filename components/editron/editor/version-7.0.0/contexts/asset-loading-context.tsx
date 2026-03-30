"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
} from "react";

interface AssetLoadingContextType {
  isLoadingAssets: boolean;
  isInitialLoad: boolean;
  handleAssetLoadingChange: (overlayId: number, isLoading: boolean) => void;
  setInitialLoadComplete: () => void;
}

const AssetLoadingContext = createContext<AssetLoadingContextType | undefined>(
  undefined
);

export const useAssetLoading = () => {
  const context = useContext(AssetLoadingContext);
  if (!context) {
    throw new Error(
      "useAssetLoading must be used within an AssetLoadingProvider"
    );
  }
  return context;
};

interface AssetLoadingProviderProps {
  children: React.ReactNode;
}

export const AssetLoadingProvider: React.FC<AssetLoadingProviderProps> = ({
  children,
}) => {
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const loadingAssetsRef = useRef(new Set<number>());
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);

  const setInitialLoadComplete = useCallback(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    setIsInitialLoad(false);
  }, []);

  const handleAssetLoadingChange = useCallback(
    (overlayId: number, isLoading: boolean) => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }

      if (isLoading) {
        loadingAssetsRef.current.add(overlayId);
        setIsLoadingAssets(true);
      } else {
        loadingAssetsRef.current.delete(overlayId);
        // Add a small delay before hiding the loading indicator to prevent flickering
        loadingTimeoutRef.current = setTimeout(() => {
          if (loadingAssetsRef.current.size === 0) {
            setIsLoadingAssets(false);
          }
        }, 300);
      }
    },
    []
  );

  // Safety timeout: if nothing reports loading within 3s of mount,
  // or if loading has been active for 8s total, force-clear the loading state.
  // This prevents the "Loading project..." overlay from getting stuck when:
  // - All assets are already cached (no load events fire)
  // - An overlay type doesn't report loading (captions, text, transitions)
  // - An asset load event is lost due to a race condition
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      if (isLoadingAssets && loadingAssetsRef.current.size === 0) {
        // Nothing is actively loading — the initial state was never cleared
        setIsLoadingAssets(false);
      }
    }, 3000);

    const maxTimer = setTimeout(() => {
      // Hard cap — never show loading for more than 8s regardless
      setIsLoadingAssets(false);
      if (isInitialLoad) {
        hasInitializedRef.current = true;
        setIsInitialLoad(false);
      }
    }, 8000);

    return () => {
      clearTimeout(safetyTimer);
      clearTimeout(maxTimer);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AssetLoadingContext.Provider
      value={{
        isLoadingAssets,
        isInitialLoad,
        handleAssetLoadingChange,
        setInitialLoadComplete,
      }}
    >
      {children}
    </AssetLoadingContext.Provider>
  );
};
