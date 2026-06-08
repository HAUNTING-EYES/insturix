export {
  ensureAtomicOverlayReceipt,
  ensureLiveAtomicOverlayReceipt,
  isAtomicOverlayReceiptCurrent,
  withAtomicOverlayReceipt,
  withAtomicOverlayUpdateReceipt,
  withAtomicOverlayReceipt as withEditorAtomicOverlayReceipt,
} from "@/lib/editron/engine/overlay-atomic-receipts";
export type {
  AtomicOverlayReceiptOptions,
  AtomicOverlayReceiptOptions as EditorAtomicReceiptOptions,
} from "@/lib/editron/engine/overlay-atomic-receipts";
