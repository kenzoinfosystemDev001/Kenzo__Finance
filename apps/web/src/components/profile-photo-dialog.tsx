'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { removeProfilePhotoAction, saveProfilePhotoAction } from '@/lib/profile-photo-actions';
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_TYPES, type PhotoOwner } from '@/lib/profile-photo';
import { IconX } from './icons';
import { UserAvatar } from './user-avatar';

/** On-screen crop circle, in CSS pixels. Drawn at 2x for sharp edges. */
const VIEW_PX = 280;
const VIEW_DRAW_PX = VIEW_PX * 2;
/** What gets uploaded. The API re-encodes to this size as well. */
const OUTPUT_PX = 512;
const PREVIEW_PX = 96;
const MIN_SOURCE_PX = 128;
const MAX_ZOOM = 4;

interface Crop {
  /** Crop centre, in source-image pixels. */
  cx: number;
  cy: number;
  /** 1 = largest square that fits the image; higher zooms in. */
  zoom: number;
}

/** Side length of the square crop, in source pixels. */
function sideOf(img: HTMLImageElement, zoom: number): number {
  return Math.min(img.naturalWidth, img.naturalHeight) / zoom;
}

/** Keeps the crop square entirely inside the image. */
function clampCrop(img: HTMLImageElement, crop: Crop): Crop {
  const side = sideOf(img, crop.zoom);
  const half = side / 2;
  return {
    zoom: crop.zoom,
    cx: Math.min(Math.max(crop.cx, half), img.naturalWidth - half),
    cy: Math.min(Math.max(crop.cy, half), img.naturalHeight - half),
  };
}

/** Draws the chosen square into a canvas of the given pixel size. */
function drawCrop(canvas: HTMLCanvasElement | null, img: HTMLImageElement, crop: Crop): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const side = sideOf(img, crop.zoom);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, crop.cx - side / 2, crop.cy - side / 2, side, side, 0, 0, canvas.width, canvas.height);
}

export function ProfilePhotoDialog({
  owner,
  fullName,
  currentVersion,
  open,
  onClose,
  onSaved,
}: {
  owner: PhotoOwner;
  fullName: string;
  currentVersion: string | null;
  open: boolean;
  onClose: () => void;
  /** Called with the new version (null after removal) once the server confirms. */
  onSaved: (version: string | null) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>({ cx: 0, cy: 0, zoom: 1 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const viewRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  // Reset everything each time the dialog opens; remember what had focus.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    setError(null);
    setConfirmRemove(false);
    dialogRef.current?.focus();
    return () => {
      openerRef.current?.focus?.();
    };
  }, [open]);

  // Release the object URL whenever it changes or the dialog unmounts.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  // Redraw the crop and the preview whenever the selection changes.
  useEffect(() => {
    if (!img) return;
    drawCrop(viewRef.current, img, crop);
    drawCrop(previewRef.current, img, crop);
  }, [img, crop]);

  function reset() {
    setObjectUrl(null);
    setImg(null);
    setCrop({ cx: 0, cy: 0, zoom: 1 });
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (!(PROFILE_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setError('Choose a JPG, PNG or WEBP image.');
      return;
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setError('The photo must be 2 MB or smaller.');
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth < MIN_SOURCE_PX || image.naturalHeight < MIN_SOURCE_PX) {
        URL.revokeObjectURL(url);
        setError(`The photo must be at least ${MIN_SOURCE_PX} × ${MIN_SOURCE_PX} pixels.`);
        return;
      }
      setError(null);
      setConfirmRemove(false);
      setObjectUrl(url);
      setImg(image);
      setCrop({ cx: image.naturalWidth / 2, cy: image.naturalHeight / 2, zoom: 1 });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError('That file could not be read as an image.');
    };
    image.src = url;
  }

  // ---- Reposition by dragging, zoom with the slider or arrow keys -----------

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!img) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, cx: crop.cx, cy: crop.cy };
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!img || !dragRef.current) return;
    const side = sideOf(img, crop.zoom);
    const viewPerSource = VIEW_PX / side;
    const dx = (event.clientX - dragRef.current.x) / viewPerSource;
    const dy = (event.clientY - dragRef.current.y) / viewPerSource;
    setCrop(clampCrop(img, { zoom: crop.zoom, cx: dragRef.current.cx - dx, cy: dragRef.current.cy - dy }));
  }

  function endDrag() {
    dragRef.current = null;
  }

  function setZoom(zoom: number) {
    if (!img) return;
    setCrop((current) => clampCrop(img, { ...current, zoom }));
  }

  function onViewKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!img) return;
    const step = sideOf(img, crop.zoom) * 0.03;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setCrop(clampCrop(img, { zoom: crop.zoom, cx: crop.cx + move[0], cy: crop.cy + move[1] }));
  }

  // ---- Save and remove ------------------------------------------------------

  async function save() {
    if (!img) return;
    setError(null);
    setBusy('save');

    const out = document.createElement('canvas');
    out.width = OUTPUT_PX;
    out.height = OUTPUT_PX;
    drawCrop(out, img, crop);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      setBusy(null);
      setError('The photo could not be prepared. Try again.');
      return;
    }

    const form = new FormData();
    form.set('file', new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' }));
    const result = await saveProfilePhotoAction(owner, form);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved(result.version ?? null);
    reset();
    onClose();
  }

  async function remove() {
    setError(null);
    setBusy('remove');
    const result = await removeProfilePhotoAction(owner);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirmRemove(false);
    onSaved(null);
    reset();
    onClose();
  }

  if (!open) return null;

  const zoomPct = Math.round(crop.zoom * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-photo-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="anim-dialog-in flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-surface shadow-popover focus:outline-none sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="profile-photo-title" className="text-lg font-semibold text-ink">Profile photo</h2>
            <p className="mt-0.5 text-sm text-ink-muted">JPG, PNG or WEBP, up to 2 MB, at least 128 × 128 px.</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy !== null}
            aria-label="Close"
            className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
          >
            <IconX size={18} aria-hidden />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {!img ? (
            <div className="flex flex-col items-center gap-5">
              <UserAvatar owner={owner} fullName={fullName} version={currentVersion} size="xl" ring />
              <p className="text-center text-sm text-ink-muted">
                {currentVersion ? 'This is your current photo.' : 'No photo yet. Initials are shown instead.'}
              </p>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy !== null}
                  className="btn-primary h-10 justify-center px-5"
                >
                  {currentVersion ? 'Choose a new photo' : 'Upload a photo'}
                </button>
                {currentVersion &&
                  (confirmRemove ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm text-ink-muted">Remove it?</span>
                      <button type="button" onClick={remove} disabled={busy !== null} className="btn-danger h-10 px-4">
                        {busy === 'remove' ? 'Removing…' : 'Yes, remove'}
                      </button>
                      <button type="button" onClick={() => setConfirmRemove(false)} disabled={busy !== null} className="btn-secondary h-10 px-4">
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy !== null} className="btn-secondary h-10 justify-center px-5">
                      Remove photo
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5">
              <canvas
                ref={viewRef}
                width={VIEW_DRAW_PX}
                height={VIEW_DRAW_PX}
                role="img"
                aria-label="Crop preview. Drag to reposition, or use the arrow keys."
                tabIndex={0}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onViewKeyDown}
                style={{ width: VIEW_PX, height: VIEW_PX, maxWidth: '100%' }}
                className="cursor-grab touch-none select-none rounded-full bg-surface-muted ring-2 ring-border focus-visible:outline-none focus-visible:ring-accent active:cursor-grabbing"
              />

              <div className="flex w-full max-w-[280px] items-center gap-3">
                <label htmlFor="profile-photo-zoom" className="text-sm font-medium text-ink-muted">Zoom</label>
                <input
                  id="profile-photo-zoom"
                  type="range"
                  min={100}
                  max={MAX_ZOOM * 100}
                  step={1}
                  value={zoomPct}
                  onChange={(e) => setZoom(Number(e.target.value) / 100)}
                  className="w-full accent-[rgb(var(--accent))]"
                  aria-valuetext={`${zoomPct}%`}
                />
                <span className="w-12 text-right text-sm tabular-nums text-ink-muted">{zoomPct}%</span>
              </div>

              <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-muted/60 px-4 py-3">
                <canvas
                  ref={previewRef}
                  width={PREVIEW_PX * 2}
                  height={PREVIEW_PX * 2}
                  aria-hidden
                  style={{ width: PREVIEW_PX, height: PREVIEW_PX }}
                  className="rounded-full bg-surface shadow-card"
                />
                <div className="text-sm text-ink-muted">
                  <p className="font-medium text-ink">Preview</p>
                  <p>This is how your avatar will look in the header.</p>
                </div>
              </div>

              <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy !== null} className="btn-secondary h-10 justify-center px-4">
                  Choose another
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={close} disabled={busy !== null} className="btn-secondary h-10 flex-1 justify-center px-4 sm:flex-none">
                    Cancel
                  </button>
                  <button type="button" onClick={save} disabled={busy !== null} className="btn-primary h-10 flex-1 justify-center px-5 sm:flex-none">
                    {busy === 'save' ? 'Saving…' : 'Save photo'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={PROFILE_PHOTO_TYPES.join(',')}
          className="sr-only"
          aria-label="Choose a profile photo"
          onChange={(e) => {
            chooseFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
