"use client";

import React, { useState } from "react";
import { FormSubmitButton } from "@/components/admin/FormSubmitButton";

type CreateNotificationFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function AdminNotificationCreateForm({
  action,
}: CreateNotificationFormProps) {
  const [deliveryMode, setDeliveryMode] = useState<"now" | "schedule">("now");
  const scheduleDisabled = deliveryMode !== "schedule";

  return (
    <form action={action} className="mt-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="title" className="text-sm font-medium">
            Título
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={140}
            placeholder="Ex: Manutenção programada"
            className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="body" className="text-sm font-medium">
            Mensagem
          </label>
          <textarea
            id="body"
            name="body"
            required
            rows={4}
            placeholder="Descreva a mensagem para os usuários..."
            className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="type" className="text-sm font-medium">
            Tipo
          </label>
          <select
            id="type"
            name="type"
            defaultValue="info"
            className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
          >
            <option value="info">Info</option>
            <option value="warning">Aviso</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="action_url" className="text-sm font-medium">
            URL de ação (opcional)
          </label>
          <input
            id="action_url"
            name="action_url"
            type="url"
            placeholder="https://..."
            className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="image" className="text-sm font-medium">
            Imagem (opcional)
          </label>
          <input
            id="image"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-primary-hover"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            JPG, PNG ou WEBP, até 5MB.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="image_alt" className="text-sm font-medium">
            Texto alternativo da imagem (opcional)
          </label>
          <input
            id="image_alt"
            name="image_alt"
            maxLength={240}
            placeholder="Descrição da imagem"
            className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="delivery_mode" className="text-sm font-medium">
            Entrega
          </label>
          <select
            id="delivery_mode"
            name="delivery_mode"
            value={deliveryMode}
            onChange={(e) =>
              setDeliveryMode(
                e.target.value === "schedule" ? "schedule" : "now"
              )
            }
            className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
          >
            <option value="now">Publicar agora</option>
            <option value="schedule">Agendar</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="scheduled_at_local" className="text-sm font-medium">
            Data/hora agendada
          </label>
          <input
            id="scheduled_at_local"
            name="scheduled_at_local"
            type="datetime-local"
            disabled={scheduleDisabled}
            className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 disabled:bg-gray-100 disabled:text-gray-400 dark:bg-white/5 dark:disabled:bg-gray-900/30 dark:disabled:text-gray-500 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <FormSubmitButton
          idleText="Criar notificação"
          pendingText="Processando..."
          className="px-4 py-2 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
        />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Se escolher agendamento, a data/hora deve estar no futuro.
        </p>
      </div>
    </form>
  );
}
