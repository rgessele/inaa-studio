"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function setParam(
  params: URLSearchParams,
  key: string,
  value: string | number | null
) {
  if (value === null || value === "") {
    params.delete(key);
  } else {
    params.set(key, String(value));
  }
}

export function UserProjectsControls(props: {
  page: number;
  pageSize: number;
  total: number;
  query: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [qDraft, setQDraft] = useState(props.query);

  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const page = clampInt(props.page, 1, totalPages);

  const from = props.total === 0 ? 0 : (page - 1) * props.pageSize + 1;
  const to = Math.min(props.total, page * props.pageSize);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const currentParams = useMemo(() => new URLSearchParams(sp.toString()), [sp]);

  const navigate = (next: {
    page?: number;
    pageSize?: number;
    query?: string;
  }) => {
    const p = new URLSearchParams(currentParams);

    if (typeof next.pageSize === "number") {
      setParam(p, "mPageSize", next.pageSize);
      setParam(p, "mPage", 1);
    }

    if (typeof next.query === "string") {
      setParam(p, "mq", next.query.trim());
      setParam(p, "mPage", 1);
    }

    if (typeof next.page === "number") {
      setParam(p, "mPage", next.page);
    }

    router.push(`?${p.toString()}`);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1">
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Buscar molde por nome"
            className="w-full text-[11px] px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-white/10"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                navigate({ query: qDraft });
              }
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-[11px] px-2 py-2 rounded-md bg-primary hover:bg-primary-hover text-white transition-colors"
            onClick={() => navigate({ query: qDraft })}
          >
            Buscar
          </button>
          <button
            type="button"
            className="text-[11px] px-2 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors"
            onClick={() => {
              setQDraft("");
              navigate({ query: "" });
            }}
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600 dark:text-gray-300">
        <span>
          Mostrando <span className="font-semibold">{from}</span>–
          <span className="font-semibold">{to}</span> de{" "}
          <span className="font-semibold">{props.total}</span>
        </span>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <span>Por página</span>
            <select
              value={props.pageSize}
              className="text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5"
              onChange={(e) => {
                const n = Number(e.target.value);
                const nextSize = Number.isFinite(n) ? n : 50;
                navigate({ pageSize: nextSize });
              }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canPrev}
              className="text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 disabled:opacity-50"
              onClick={() => navigate({ page: page - 1 })}
            >
              Anterior
            </button>
            <span className="px-1">
              Página <span className="font-semibold">{page}</span>/{totalPages}
            </span>
            <button
              type="button"
              disabled={!canNext}
              className="text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 disabled:opacity-50"
              onClick={() => navigate({ page: page + 1 })}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
