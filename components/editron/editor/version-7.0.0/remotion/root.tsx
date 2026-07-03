import React from "react";
import { Composition } from "remotion";

import { COMP_NAME } from "../constants";
import { Main } from "./main";
import { calculateEditronMetadata, defaultEditronCompositionProps } from "./metadata";

/**
 * Root component for the Remotion project.
 * Sets up the composition and provides default props.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMP_NAME}
      component={Main}
      durationInFrames={defaultEditronCompositionProps.durationInFrames}
      fps={defaultEditronCompositionProps.fps}
      width={defaultEditronCompositionProps.width}
      height={defaultEditronCompositionProps.height}
      calculateMetadata={calculateEditronMetadata}
      defaultProps={defaultEditronCompositionProps}
    />
  );
};
