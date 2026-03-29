import React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

export function Progress({ value = 0, className, ...props }: ProgressProps) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-full bg-zinc-800", className)}
      {...props}
    >
      <div
        className="h-full bg-amber-500 transition-all duration-500"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}
