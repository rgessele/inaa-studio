"use client";

import { useEffect } from "react";
import { toast } from "@/utils/toast";

const REASON_MESSAGES: Record<string, string> = {
  blocked: "Seu acesso está bloqueado.",
  expired: "Seu acesso expirou.",
  inactive: "Seu acesso está inativo.",
};

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Preencha email e senha.",
  invalid: "Email ou senha inválidos.",
};

export function LoginToasts(props: { reason?: string; error?: string }) {
  useEffect(() => {
    if (props.reason) {
      const message =
        REASON_MESSAGES[props.reason] ?? "Não foi possível acessar.";
      toast(message, "error");
      return;
    }

    if (props.error) {
      const message =
        ERROR_MESSAGES[props.error] ?? "Não foi possível fazer login.";
      toast(message, "error");
    }
  }, [props.error, props.reason]);

  return null;
}
