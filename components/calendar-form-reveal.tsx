"use client";

/** Mount with a changing `key` on the parent wrapper so the enter animation runs when panels open. */
export function CalendarFormReveal({ children }: { children: React.ReactNode }) {
  return <div className="cal-form-reveal">{children}</div>;
}
