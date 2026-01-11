export type ToastType = "success" | "error";

type ToastDetail = {
  message: string;
  type: ToastType;
};

export const TOAST_EVENT_NAME = "inaa:toast" as const;

export function toast(message: string, type: ToastType = "error"): void {
  if (typeof window === "undefined") {
    if (type === "error") {
      console.error(message);
    } else {
      console.log(message);
    }
    return;
  }

  const detail: ToastDetail = { message, type };
  window.dispatchEvent(
    new CustomEvent<ToastDetail>(TOAST_EVENT_NAME, { detail })
  );
}
