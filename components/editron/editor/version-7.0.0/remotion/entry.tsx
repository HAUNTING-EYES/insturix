import React from "react";
import { Composition, registerRoot } from "remotion";

import { COMP_NAME } from "../constants";
import { Main } from "./main";
import { calculateEditronMetadata, defaultEditronCompositionProps } from "./metadata";

const Root: React.FC = () => {
  return (
    <Composition
      id={COMP_NAME}
      component={Main}
      durationInFrames={defaultEditronCompositionProps.durationInFrames}
      fps={defaultEditronCompositionProps.fps}
      width={defaultEditronCompositionProps.width}
      height={defaultEditronCompositionProps.height}
      defaultProps={defaultEditronCompositionProps}
      calculateMetadata={calculateEditronMetadata}
    />
  );
};

registerRoot(Root);
