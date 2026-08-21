/* ═══ Insturix primitives ═════════════════════════════════════════════
   The shared warm-dark / gold-only primitive library. One source of truth
   for the design vocabulary, consuming the design-tokens.css variables via
   the Tailwind token utilities. Reuse everywhere; do not re-derive per
   surface. */

export { Mono, type MonoSize } from './mono';
export { Btn } from './btn';
export { Field, inputClass, textareaClass } from './field';
export { Seg, Toggle, Drop } from './controls';
export { Glyph, Chip, StatusMark, type StatusKind } from './badges';
export { Portrait, type PortraitSize } from './portrait';
export { Modal, Confirm, type ModalWidth } from './modal';
export { Track, Clip, type ClipTone } from './track';
export { Select, type SelectOption } from './select';
export { Skeleton, EmptyState, ErrorState } from './feedback';
