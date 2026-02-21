"use client";

import React from "react";
import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = {
  idleText: string;
  pendingText: string;
  className: string;
};

export function FormSubmitButton({
  idleText,
  pendingText,
  className,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {pending ? pendingText : idleText}
    </button>
  );
}
