export type FreeformEditableProperty =
  | 'text'
  | 'style'
  | 'className'
  | 'children'
  | 'props';

export interface FreeformTraceTarget {
  eid?: string;
  sourceLoc?: string;
}

export interface FreeformTraceElement {
  eid: string;
  sourceLoc: string;
  tagName: string;
  parentEid: string | null;
  childEids: string[];
  editable: FreeformEditableProperty[];
  selfClosing: boolean;
  start: number;
  end: number;
  openingStart: number;
  openingEnd: number;
  existingTrace: boolean;
  textPreview?: string;
}

export interface InstrumentedFreeformTsx {
  code: string;
  fileName: string;
  elements: FreeformTraceElement[];
  insertedAttributeCount: number;
}

export interface FreeformTraceOptions {
  filename?: string;
  eidPrefix?: string;
}

export interface ParsedSourceLoc {
  fileName: string;
  line: number;
  column: number;
}

