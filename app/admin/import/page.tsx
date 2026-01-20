import { createClient } from "@/lib/supabase/server";
import { adminImportUsersCsv } from "@/app/admin/actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toStr(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function AdminImportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const jobId = toStr(sp.job).trim();

  const supabase = await createClient();

  const job = jobId
    ? await supabase
        .from("import_jobs")
        .select("id, file_name, summary, created_at")
        .eq("id", jobId)
        .single()
    : null;

  const rows = jobId
    ? await supabase
        .from("import_job_rows")
        .select("row_number, email, status, message")
        .eq("job_id", jobId)
        .order("row_number", { ascending: true })
        .limit(500)
    : null;

  const summary = (job?.data?.summary ?? null) as
    | {
        total?: number;
        ok?: number;
        failed?: number;
        invited?: number;
        updated?: number;
      }
    | null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-accent-gold">
          Importar usuários
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          CSV (defaults: assinante/ativo). Pode definir role/status/expiração.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
        <form action={adminImportUsersCsv} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Arquivo CSV
            </label>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="mt-2 block w-full text-sm text-gray-700 dark:text-gray-200 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white hover:file:bg-primary-hover file:cursor-pointer"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Colunas aceitas: <span className="font-mono">email</span> (obrigatório),
              <span className="font-mono"> full_name</span>,
              <span className="font-mono"> role</span>,
              <span className="font-mono"> status</span>,
              <span className="font-mono"> access_expires_at</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
            >
              Importar
            </button>
            <a
              href="/admin-users-import-sample.csv"
              download
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 text-sm text-gray-900 dark:text-gray-100 transition-colors"
            >
              Baixar CSV de exemplo
            </a>
          </div>
        </form>
      </div>

      {jobId ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Relatório
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Job: <span className="font-mono">{jobId}</span>
              {job?.data?.file_name ? ` • ${job.data.file_name}` : ""}
            </p>

            {summary ? (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-accent-gold">
                    {summary.total ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">OK</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-accent-gold">
                    {summary.ok ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Falhas</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-accent-gold">
                    {summary.failed ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Convidados</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-accent-gold">
                    {summary.invited ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/5 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Atualizados</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-accent-gold">
                    {summary.updated ?? 0}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark shadow-subtle overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-white/50 dark:bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Linha
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Mensagem
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {(rows?.data ?? []).map((r) => (
                    <tr key={r.row_number}>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        {r.row_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        {r.email || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={
                            r.status === "ok"
                              ? "text-[11px] px-2 py-1 rounded-full bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-200 border border-green-200 dark:border-green-900/30"
                              : "text-[11px] px-2 py-1 rounded-full bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-900/30"
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        {r.message || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
