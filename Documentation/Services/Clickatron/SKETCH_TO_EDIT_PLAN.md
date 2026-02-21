# Clickatron Editor Enhancement: Architecture & Implementation Plan

Three distinct features that share the Canvas Drawing Tools as a foundation.

---

## Feature 1: Canvas Drawing Tools (Foundation)

### Tools

| Tool                   | Behavior                                         | Shortcut |
| ---------------------- | ------------------------------------------------ | -------- |
| **Default Cursor (V)** | Pan/zoom the canvas                              | `V`      |
| **Brush / Pen (B)**    | Freehand drawing. Color picker + 3 stroke widths | `B`      |
| **Eraser (E)**         | Erase individual strokes                         | `E`      |
| **Arrow (A)**          | Click-drag directional arrows                    | `A`      |
| **Line (L)**           | Straight line tool                               | `L`      |
| **Shapes (S)**         | Rectangle, circle. Filled vs outline toggle      | `S`      |
| **Text (T)**           | Click to place a text box                        | `T`      |
| **Image Drop (I)**     | File picker → draggable, resizable sticker       | `I`      |
| **Select / Move (M)**  | Click any annotation to select, drag to move     | `M`      |

### Deletion & Manipulation

- **Delete key / Backspace**: Deletes the currently selected annotation element.
- **Click + Delete**: Click any annotation to select it (shows handles), press Delete to remove.
- **Right-click context menu**: "Delete" option on any annotation.
- **Multi-select**: `Shift+Click` to select multiple elements, then Delete to remove all.
- **`Ctrl/Cmd+Z`**: Undo last annotation action.
- **`Ctrl/Cmd+Shift+Z`**: Redo.
- **`Ctrl/Cmd+A`**: Select all annotations.
- **`Escape`**: Deselect all / exit current tool back to Default Cursor.

> [!IMPORTANT]
> **When a dropped image is deleted from the canvas, it must also be removed from the AI Console's attached images list.** The console and the annotation layer must stay in sync at all times.

### Implementation

- **Component**: `AnnotationLayer.tsx` — Konva `<Stage>` + `<Layer>` overlay on `ImageDisplay`, matching its pixel dimensions.
- **Library**: `react-konva` (Konva.js).
- **State**: New `annotations: Annotation[]` in Zustand store, scoped per variation.
- **Toolbar**: `AnnotationToolbar.tsx` — vertical floating bar, left edge of canvas area.

### Visual Treatment

- Annotations render in markup style: semi-transparent, vibrant strokes (red/blue/yellow presets).
- Dropped images have dashed borders + corner resize handles.
- Selected elements show a blue selection outline with drag handles.

---

## Feature 2: Sketch-to-Edit

### Flow

1. User draws annotations on canvas using the drawing tools.
2. AI Console auto-populates reference images:
   - **Slot 1**: Placeholder icon representing the flattened annotated canvas (labelled "Annotated Canvas").
   - **Slots 2+**: Each dropped image asset, in order. Synced live — deleting from canvas removes from console.
3. Prompt auto-fills: `"Apply the edits as shown in @image1, all related images are attached."`
4. Model selector shows all models, with recommended models for sketch-to-edit **highlighted** (e.g., a `★ Recommended` badge or a colored accent).
5. User hits Send → flattened image + assets uploaded to GCS → passed as `image_urls` to the model.

### Storage & Project History

To maintain project history and ensure QStash retry reliability, **all assets are stored in Google Cloud Storage (GCS)** rather than temporary model storage.

> [!IMPORTANT]
> **Subfolder Organization**: All sketches and flattened annotation canvases will be stored in a dedicated `sketch-to-edit/` subfolder within the session's GCS bucket path. 
> 
> Example: `sessions/[session-id]/sketch-to-edit/[variation-id]_[timestamp].jpg`

- **Reliability**: Ensures assets are available if QStash retries the job hours later.
- **History**: Allows the user to review the "instruction sketch" for any past variation in the gallery.
- **Security**: The worker uses `ClickatronGCSManager.getSignedUrl()` to generate short-lived access for the AI model.

### Model Selector Behavior

**All models remain visible at all times.** When annotations are present:
- Recommended models get a visual `★ Recommended` badge beside their name in the dropdown.
- The selector auto-switches to the top recommended model (user can override).
- When annotations are cleared, the badge disappears and the previously used model is restored.

**Recommended Sketch-to-Edit Models:**

| Model                | Fal AI ID                     | `maxImages`       |
| -------------------- | ----------------------------- | ----------------- |
| Nanobanana Pro Edit  | `fal-ai/nano-banana-pro/edit` | TBD (array-based) |
| Qwen Image Edit 2511 | `fal-ai/qwen-image-edit-2511` | 1                 |
| Wan 2.6 Image        | `wan/v2.6/image-to-image`     | 10+ (array-based) |

### Image Count Validation & Send Button

If `totalImages > selectedModel.constraints.maxImages`:
- **Send button disabled.**
- Inline warning box (styled, not an alert):
  > `⚠️ [Model Name] supports up to N images. You have M attached. Remove images or switch models.`

If model doesn't support `image-to-image`:
- **Send button disabled.**
  > `⚠️ [Model Name] doesn't support image editing.`

---

## Feature 3: Generative Fill UX Redesign

### Current Flow (Being Replaced)
Button on image → draw selection → full-screen modal → prompt → generate.

### New Flow
1. Selection tools (Lasso, Rectangle) live in the left toolbar under a `✨ FILL` section header.
2. User draws selection.
3. **Floating mini-panel** appears anchored near the selection (not a modal):

```
┌──────────────────────────────────────┐
│  [ What do you want here?...       ] │
│  [ Model: Flux Pro Fill        ▾ ]   │
│  [ ✨ Generate Fill ]  [ ✕ Cancel ]  │
└──────────────────────────────────────┘
```

4. Existing generative fill backend flow is triggered (mask + image → inpainting model).
5. New variation created.

---

## Mutual Exclusivity Rules

| State           | Fill Tools  | Sketch Tools | Console Mode     |
| --------------- | ----------- | ------------ | ---------------- |
| Nothing drawn   | ✅           | ✅            | Standard AI Edit |
| Sketch present  | ❌ (tooltip) | ✅            | Sketch-to-Edit   |
| Selection drawn | ✅           | ❌ (tooltip)  | Generative Fill  |
| Generating      | ❌           | ❌            | Loading          |

`🗑️ Clear All` resets to "Nothing drawn", re-enabling all tools.

---

## Code Principles

1. **Single Responsibility**: Each tool is its own component (`BrushTool.tsx`, `ArrowTool.tsx`, etc.) with a shared interface. The `AnnotationToolbar` orchestrates them.
2. **State Separation**: Annotation state lives in Zustand alongside variations but is clearly scoped (`canvas.annotations`).
3. **Reactive Sync**: The AI Console's reference images are derived from annotation state via a Zustand selector — not manually synced. When an image annotation is deleted, the selector automatically reflects the change.
4. **Clean Abstractions**: 
   - `flattenCanvas(...)`: pure utility.
   - `uploadAnnotationAssets(...)`: handles GCS upload to the `/sketch-to-edit` subfolder.
5. **No God Components**: New logic in dedicated hooks (`useAnnotations`, `useSketchToEdit`, etc.).
6. **Type Safety**: All annotation types are defined in `types/clickatron.ts` with discriminated unions.

---

## Verification Plan

### Manual Verification
1. **Drawing Tools**: Verify each tool works on the canvas overlay.
2. **Deletion**: Select annotation → press Delete → verify removed from canvas AND AI Console.
3. **Keyboard Shortcuts**: Verify `B`, `E`, `A`, `L`, `S`, `T`, `I`, `M`, `V`, `Ctrl+Z`, `Ctrl+Shift+Z`, `Delete`, `Escape`.
4. **Sketch-to-Edit Submission**: Draw annotations → verify storage in `sketch-to-edit/` folder → check history view.
5. **Model Recommendation**: Draw annotation → verify recommended models show `★` badge.
6. **Image Count Validation**: Verify Send disabled if count exceeds max.
7. **Generative Fill**: Use lasso → verify floating panel near selection.
8. **Mutual Exclusivity**: Draw brush → verify lasso disabled. Clear all → verify lasso re-enables.
