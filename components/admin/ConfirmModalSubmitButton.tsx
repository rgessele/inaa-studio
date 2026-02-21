"use client";

import React, { useEffect, useRef, useState } from "react";

type ConfirmModalSubmitButtonProps = {
  idleText: string;
  pendingText: string;
  className: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmButtonClassName?: string;
};

export function ConfirmModalSubmitButton({
  idleText,
  pendingText,
  className,
  confirmTitle,
  confirmDescription,
  confirmButtonClassName,
}: ConfirmModalSubmitButtonProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const form = triggerRef.current?.closest("form");
          if (!form) return;
          formRef.current = form;
          setOpen(true);
        }}
        disabled={submitting}
        className={`${className} disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {submitting ? pendingText : idleText}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-dark shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {confirmTitle}
              </h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {confirmDescription}
              </p>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setOpen(false)}
                className="h-9 px-3 rounded-md border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  if (!formRef.current) return;
                  setSubmitting(true);
                  formRef.current.requestSubmit();
                }}
                className={`${confirmButtonClassName ?? "h-9 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm"} disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {submitting ? pendingText : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
