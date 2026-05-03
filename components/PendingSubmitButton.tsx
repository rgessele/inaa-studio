"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { InlineSpinner } from "@/components/InlineSpinner";

type PendingSubmitButtonProps = {
  idleText: string;
  pendingText: string;
  className: string;
};

export function PendingSubmitButton({
  idleText,
  pendingText,
  className,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 ${className} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {pending ? <InlineSpinner className="h-4 w-4" /> : null}
      <span>{pending ? pendingText : idleText}</span>
    </button>
  );
}