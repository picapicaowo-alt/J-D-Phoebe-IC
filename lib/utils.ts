import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sortByLabel<T extends { label: string }>(items: readonly T[]) {
  return [...items].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}
