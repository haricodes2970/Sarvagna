import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost";
  size?: "default" | "icon";
}

export function Button({
  variant = "default",
  size = "default",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "default" && "h-9 px-4 py-2 text-sm",
        size === "icon" && "h-9 w-9",
        variant === "default" && "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
        variant === "secondary" && "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
        variant === "ghost" && "bg-transparent hover:bg-zinc-800 text-zinc-400",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
