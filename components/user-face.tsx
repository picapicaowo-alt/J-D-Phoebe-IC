import clsx from "clsx";

function pairInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

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
  const initials = pairInitials(name);
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
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-black/5 text-xs font-semibold text-[hsl(var(--muted))] dark:bg-white/10",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
