"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Toast } from "@/components/editor/Toast";
import { TOAST_EVENT_NAME, type ToastType } from "@/utils/toast";

type ToastState = {
  message: string;
  type: ToastType;
  isVisible: boolean;
};

export function ToastHost() {
  const [toastState, setToastState] = useState<ToastState>({
    message: "",
    type: "success",
    isVisible: false,
  });

  const close = useCallback(() => {
    setToastState((prev) => ({ ...prev, isVisible: false }));
  }, []);

  useEffect(() => {
    const onToast = (evt: Event) => {
      const custom = evt as CustomEvent<{ message: string; type: ToastType }>;
      const detail = custom.detail;
      if (!detail?.message) return;
      setToastState({
        message: detail.message,
        type: detail.type,
        isVisible: true,
      });
    };

    window.addEventListener(TOAST_EVENT_NAME, onToast);
    return () => window.removeEventListener(TOAST_EVENT_NAME, onToast);
  }, []);

  return (
    <Toast
      message={toastState.message}
      type={toastState.type}
      isVisible={toastState.isVisible}
      onClose={close}
    />
  );
}
