import React from "react";

type InlineSpinnerProps = {
  className?: string;
};

export function InlineSpinner({ className = "h-4 w-4" }: InlineSpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin ${className}`}
    />
  );
}