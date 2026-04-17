"use client";

import { useRef } from "react";
import { UserFace } from "@/components/user-face";

export function StaffAvatarPreview({
  name,
  avatarUrl,
  size = 28,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (!avatarUrl) {
    return <UserFace name={name} avatarUrl={avatarUrl} size={size} className={className} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
        aria-label={`Preview ${name}'s avatar`}
        title={name}
      >
        <UserFace name={name} avatarUrl={avatarUrl} size={size} className={className} />
      </button>

      <dialog
        ref={dialogRef}
        className="app-modal-dialog z-50 max-h-[calc(100dvh-1rem)] w-[min(100vw-2rem,960px)] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-2xl backdrop:bg-black/60"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-end border-b border-[hsl(var(--border))] px-3 py-2">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted))] hover:bg-[hsl(var(--muted))]/20"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close image preview"
          >
            ×
          </button>
        </div>
        <div className="flex max-h-[80dvh] items-center justify-center p-4 sm:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl} alt={name} className="max-h-[calc(80dvh-1rem)] max-w-full object-contain" />
        </div>
      </dialog>
    </>
  );
}
