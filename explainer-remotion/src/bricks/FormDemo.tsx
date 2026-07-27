import React from 'react';
import type {Brand} from './brand';
import {BrandRevealScene} from './BrandRevealScene';
import {CursorWalkthrough} from './CursorWalkthrough';
import {SplitCompare} from './SplitCompare';

export type FormId = 'hero' | 'cursor' | 'split';

// Renders one form for one brand. This is the seam a GLM "director" would drive: it picks the form + brand
// (+ copy), the engine renders it deterministically.
export const FormDemo: React.FC<{brand: Brand; form: FormId}> = ({brand, form}) => {
  if (form === 'cursor') return <CursorWalkthrough brand={brand} />;
  if (form === 'split') return <SplitCompare brand={brand} />;
  return <BrandRevealScene brand={brand} />;
};
