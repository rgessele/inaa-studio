"use client";

import React, { useEffect, useRef, useState } from "react";

type BulkActionSubmitButtonProps = {
  className: string;
};

export function BulkActionSubmitButton({ className }: BulkActionSubmitButtonProps) {
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

  const submitBulkForm = () => {
    const form = formRef.current;
    if (!form) return;
    setSubmitting(true);
    form.requestSubmit();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={submitting}
        onClick={() => {
          const form = triggerRef.current?.closest("form");
          if (!form) return;
          formRef.current = form;

          if (!form.reportValidity()) return;

          const actionSelect = form.querySelector(
            'select[name="bulk_action"]'
          ) as HTMLSelectElement | null;
          const action = (actionSelect?.value ?? "").trim();

          if (action === "delete") {
            setOpen(true);
            return;
          }

          submitBulkForm();
        }}
        className={`${className} disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {submitting ? "Aplicando..." : "Aplicar nas selecionadas"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-dark shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Confirmar exclusão em massa
              </h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Tem certeza que deseja apagar as notificações selecionadas? As
                mensagens enviadas também serão removidas da lista de todos os
                usuários.
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
                onClick={submitBulkForm}
                className="h-9 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Aplicando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
