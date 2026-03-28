"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: "primary" | "ghost" | "surface";
  size?: "sm" | "md";
};

export function ActionButton({
  children,
  className,
  icon,
  size = "md",
  variant = "ghost",
  ...props
}: ActionButtonProps) {
  return (
    <button
      className={cx("pc-action-button", `is-${variant}`, `is-${size}`, className)}
      {...props}
    >
      {icon ? <span className="pc-action-icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "accent" | "warning" | "danger";
}) {
  return <span className={cx("pc-status-badge", `is-${tone}`)}>{children}</span>;
}
