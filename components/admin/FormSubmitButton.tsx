"use client";

import React from "react";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";

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
  return (
    <PendingSubmitButton
      idleText={idleText}
      pendingText={pendingText}
      className={className}
    />
  );
}
