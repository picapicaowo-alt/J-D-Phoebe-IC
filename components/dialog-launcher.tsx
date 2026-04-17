"use client";

function getDialogById(dialogId: string): HTMLDialogElement | null {
  const el = document.getElementById(dialogId);
  return el instanceof HTMLDialogElement ? el : null;
}

function syncDialogEnvironment() {
  if (typeof document === "undefined") return;
  const hasOpenDialog = !!document.querySelector("dialog[open]");
  document.body.style.overflow = hasOpenDialog ? "hidden" : "";
}

function removeDialogBackdrop(dialog: HTMLDialogElement) {
  const backdropId = dialog.dataset.dialogBackdropId;
  if (backdropId) {
    document.getElementById(backdropId)?.remove();
    delete dialog.dataset.dialogBackdropId;
  }
  syncDialogEnvironment();
}

export function closeAllOpenDialogs() {
  if (typeof document === "undefined") return;
  for (const dialog of document.querySelectorAll("dialog[open]")) {
    if (dialog instanceof HTMLDialogElement) dialog.close();
  }
  for (const backdrop of document.querySelectorAll("[data-dialog-backdrop='1']")) {
    backdrop.remove();
  }
  syncDialogEnvironment();
}

function ensureDialogLifecycle(dialog: HTMLDialogElement) {
  if (dialog.dataset.dialogLifecycleBound === "1") return;
  dialog.dataset.dialogLifecycleBound = "1";
  dialog.addEventListener("close", () => removeDialogBackdrop(dialog));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dialog.close();
  });
}

function ensureSubmitClosesDialog(dialog: HTMLDialogElement) {
  if (dialog.dataset.submitCloseBound === "1") return;
  dialog.dataset.submitCloseBound = "1";
  dialog.addEventListener("submit", (event) => {
    if (event.defaultPrevented) return;
    if (dialog.open) dialog.close();
  });
}

function openDialog(dialog: HTMLDialogElement) {
  closeAllOpenDialogs();
  ensureDialogLifecycle(dialog);
  ensureSubmitClosesDialog(dialog);

  if (!dialog.open) dialog.show();

  const backdrop = document.createElement("button");
  const backdropId = `dialog-backdrop-${crypto.randomUUID()}`;
  backdrop.id = backdropId;
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close dialog");
  backdrop.setAttribute("data-dialog-backdrop", "1");
  backdrop.className = "fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]";
  backdrop.addEventListener("click", () => dialog.close());
  document.body.appendChild(backdrop);
  dialog.dataset.dialogBackdropId = backdropId;
  syncDialogEnvironment();
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
        openDialog(el);
      }}
    >
      {children}
    </button>
  );
}

export function CloseDialogButton({
  dialogId,
  className,
  label,
  disabled = false,
}: {
  dialogId: string;
  className?: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        const el = getDialogById(dialogId);
        el?.close();
      }}
    >
      {label}
    </button>
  );
}
