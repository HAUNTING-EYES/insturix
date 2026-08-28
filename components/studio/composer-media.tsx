"use client";

/**
 * Composer media (A1) — the chat entry's missing on-ramp.
 * [+ ] upload: rights gate → presign → PUT → register (real chain, honest
 *      progress states) → attachment pill.
 * [library]: unified picker over /api/studio/media (everything the user
 *      already has across engines).
 * Pills ride StudioTurnRequest.attachments — the contract that already
 * exists. Real mode only (mock keeps the demo composer).
 */

import { useRef, useState } from "react";
import { CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION } from "@/lib/editron/services/native-video-audio-rights";

export interface ComposerAttachment {
  ref: string;
  role: string;
  label: string;
}

type UploadState =
  | { phase: "idle" }
  | { phase: "rights"; file: File }
  | { phase: "uploading"; file: File; step: string }
  | { phase: "error"; file: File; message: string };

interface LibraryItem {
  id: string;
  engine: string;
  kind: string;
  title: string;
  role: string;
}

export function ComposerMedia({
  attachments,
  setAttachments,
}: {
  attachments: ComposerAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<ComposerAttachment[]>>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<UploadState>({ phase: "idle" });
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[] | null>(null);

  const startUpload = (file: File) => setUpload({ phase: "rights", file });

  const confirmRights = async () => {
    if (upload.phase !== "rights") return;
    const file = upload.file;
    setUpload({ phase: "uploading", file, step: "getting upload url…" });
    try {
      const urlRes = await fetch("/api/services/editron/media/upload/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error((await urlRes.json().catch(() => ({}))).error ?? "presign failed");
      const { uploadUrl, assetId } = await urlRes.json();
      setUpload({ phase: "uploading", file, step: `uploading ${file.name}…` });
      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error(`upload failed (${putRes.status})`);
      setUpload({ phase: "uploading", file, step: "registering…" });
      const regRes = await fetch("/api/services/editron/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          gcsPath: null,
          readUrl: null,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          type: file.type.startsWith("image") ? "image" : "video",
          sourceMediaRightsAttestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
        }),
      });
      if (!regRes.ok) throw new Error((await regRes.json().catch(() => ({}))).error ?? "registration failed");
      setAttachments((prev) => [...prev, { ref: assetId, role: "media", label: file.name }]);
      setUpload({ phase: "idle" });
    } catch (error) {
      setUpload({ phase: "error", file, message: error instanceof Error ? error.message : "upload failed" });
    }
  };

  const openLibrary = () => {
    setLibraryOpen(true);
    if (libraryItems === null) {
      fetch("/api/studio/media")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { items: LibraryItem[] }) => setLibraryItems(d.items ?? []))
        .catch(() => setLibraryItems([]));
    }
  };

  return (
    <>
      {attachments.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {attachments.map((a, i) => (
            <span key={`${a.ref}_${i}`} className="stu-chip" style={{ cursor: "pointer" }} onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
              {a.label.length > 24 ? `${a.label.slice(0, 22)}…` : a.label}
              <span style={{ color: "var(--faint)" }}>×</span>
            </span>
          ))}
        </div>
      )}
      {upload.phase === "rights" && (
        <div className="stu-hcard" style={{ marginTop: 0, marginBottom: 8 }}>
          <span className="stu-htag"><i style={{ background: "var(--gold)" }} />rights confirmation</span>
          <div className="stu-hq" style={{ marginBottom: 10 }}>
            Uploading <b>{upload.file.name}</b> — confirm you own or have rights to this media.
          </div>
          <div className="stu-btnrow" style={{ marginTop: 0 }}>
            <button className="stu-btn stu-btn-primary" onClick={confirmRights}>I have the rights</button>
            <button className="stu-btn stu-btn-ghost" onClick={() => setUpload({ phase: "idle" })}>Cancel</button>
          </div>
        </div>
      )}
      {upload.phase === "uploading" && (
        <div className="stu-receipt" style={{ marginBottom: 8 }}>
          <span className="stu-ms-run" style={{ background: "var(--gold)", width: 7, height: 7, borderRadius: 99 }} />
          <span>{upload.step}</span>
        </div>
      )}
      {upload.phase === "error" && (
        <div className="stu-receipt" style={{ marginBottom: 8, color: "var(--red)" }}>
          <span>▲ {upload.message}</span>
          <button className="stu-btn stu-btn-ghost" style={{ marginLeft: 10, padding: "2px 10px" }} onClick={() => setUpload({ phase: "idle" })}>dismiss</button>
        </div>
      )}
      {libraryOpen && (
        <div className="stu-hcard" style={{ marginTop: 0, marginBottom: 8, maxHeight: 260, overflowY: "auto" }}>
          <span className="stu-htag"><i style={{ background: "var(--c-design)" }} />your media</span>
          {libraryItems === null && <div className="stu-hq" style={{ marginBottom: 0 }}>loading…</div>}
          {libraryItems?.length === 0 && <div className="stu-hq" style={{ marginBottom: 0 }}>nothing yet — upload something with [+]</div>}
          <div className="stu-opts">
            {(libraryItems ?? []).slice(0, 20).map((item) => (
              <button
                key={`${item.engine}_${item.id}`}
                className="stu-opt"
                onClick={() => {
                  setAttachments((prev) => [...prev, { ref: item.id, role: item.role, label: item.title }]);
                  setLibraryOpen(false);
                }}
              >
                <span className="rd" />
                <div>
                  <div className="ot">{item.title.length > 40 ? `${item.title.slice(0, 38)}…` : item.title}</div>
                  <div className="od">{item.kind}</div>
                </div>
                <span className="ov">{item.engine}</span>
              </button>
            ))}
          </div>
          <div className="stu-btnrow" style={{ marginTop: 10 }}>
            <button className="stu-btn stu-btn-ghost" onClick={() => setLibraryOpen(false)}>close</button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="stu-chip" onClick={() => fileInput.current?.click()} aria-label="Upload media">[+] upload</button>
        <button className="stu-chip" onClick={openLibrary} aria-label="Open media library">[▾] library</button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*,image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) startUpload(f);
            e.target.value = "";
          }}
        />
      </div>
    </>
  );
}
