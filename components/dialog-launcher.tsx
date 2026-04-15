"use client";

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
        const el = document.getElementById(dialogId) as HTMLDialogElement | null;
        el?.showModal();
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
        const el = document.getElementById(dialogId) as HTMLDialogElement | null;
        el?.close();
      }}
    >
      {label}
    </button>
  );
}
