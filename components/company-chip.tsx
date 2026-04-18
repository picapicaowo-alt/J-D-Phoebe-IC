"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { getCompanyColorChipClassName, getCompanyColorChipStyle } from "@/lib/company-colors";

type Props = {
  name: string;
  color?: string | null;
  href?: string;
  className?: string;
};

const baseClassName = "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium no-underline";

export function CompanyChip({ name, color, href, className }: Props) {
  const chipClassName = cn(baseClassName, getCompanyColorChipClassName(color), className);
  const chipStyle = getCompanyColorChipStyle(color);
  if (href) {
    return (
      <Link href={href} prefetch={false} className={chipClassName} style={chipStyle}>
        {name}
      </Link>
    );
  }
  return (
    <span className={chipClassName} style={chipStyle}>
      {name}
    </span>
  );
}
