import clsx from "clsx";

export function UserFace({
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
  const initials = (name.trim().slice(0, 1) || "?").toUpperCase();
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className={clsx("shrink-0 rounded-full border border-[hsl(var(--border))] object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-black/5 text-[10px] font-semibold text-[hsl(var(--muted))] dark:bg-white/10",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
