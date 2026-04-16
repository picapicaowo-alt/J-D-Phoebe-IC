"use client";

function getDialogById(dialogId: string): HTMLDialogElement | null {
  const el = document.getElementById(dialogId);
  return el instanceof HTMLDialogElement ? el : null;
}

export function closeAllOpenDialogs() {
  if (typeof document === "undefined") return;
  for (const dialog of document.querySelectorAll("dialog[open]")) {
    if (dialog instanceof HTMLDialogElement) dialog.close();
  }
}

function ensureBackdropClickToClose(dialog: HTMLDialogElement) {
  if (dialog.dataset.backdropCloseBound === "1") return;
  dialog.dataset.backdropCloseBound = "1";
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export function OpenDialogButton({
  dialogId,
  className,
  children,
}: {
  dialogId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const el = getDialogById(dialogId);
        if (!el || el.open) return;
        ensureBackdropClickToClose(el);
        el.showModal();
      }}
    >
      {children}
    </button>
  );
}

export function CloseDialogButton({ dialogId, className, label }: { dialogId: string; className?: string; label: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const el = getDialogById(dialogId);
        el?.close();
      }}
    >
      {label}
    </button>
  );
}
