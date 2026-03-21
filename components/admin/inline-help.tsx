"use client";

import { CircleHelp } from "lucide-react";

export function InlineHelp({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center text-gray-400 hover:text-gray-600 ${className}`}
      title={text}
      aria-label={text}
    >
      <CircleHelp className="h-3.5 w-3.5" />
    </span>
  );
}
