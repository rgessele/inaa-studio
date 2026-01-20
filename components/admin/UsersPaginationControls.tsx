"use client";

import { useMemo } from "react";
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

export function UsersPaginationControls(props: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const page = clampInt(props.page, 1, totalPages);

  const from = props.total === 0 ? 0 : (page - 1) * props.pageSize + 1;
  const to = Math.min(props.total, page * props.pageSize);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const currentParams = useMemo(() => {
    const p = new URLSearchParams(sp.toString());
    return p;
  }, [sp]);

  const navigate = (next: { page?: number; pageSize?: number }) => {
    const p = new URLSearchParams(currentParams);
    if (typeof next.pageSize === "number") {
      setParam(p, "pageSize", next.pageSize);
      setParam(p, "page", 1);
    }
    if (typeof next.page === "number") {
      setParam(p, "page", next.page);
    }
    router.push(`/admin/users?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600 dark:text-gray-300">
      <div className="flex items-center gap-2">
        <span>
          Mostrando <span className="font-semibold">{from}</span>–
          <span className="font-semibold">{to}</span> de{" "}
          <span className="font-semibold">{props.total}</span>
        </span>
      </div>

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
  );
}
