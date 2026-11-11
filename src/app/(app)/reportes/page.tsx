import Link from "next/link";
import { Suspense } from "react";
import { ModuleGate, PageSkeleton } from "@/components/module-gate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  certificatesByClient,
  certificatesByMonth,
  filterByStatus,
  paginate,
  parseReportFilters,
  plantToday,
  reportQuery,
  summarize,
} from "@/lib/domain/report";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { canAccess } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { CertificateStatusBadge } from "../certificados/_components/status-badge";
import { ExportLinks } from "./_components/export-links";
import { ClientChart, MonthlyChart } from "./_components/report-charts";
import { ReportFilterBar } from "./_components/report-filters";
import { listReportClients, loadReportRows } from "./data";

export const metadata = { title: "Reportes" };

/** RF-07 · UC-08. Certificate history with filters, statistics, charts and export. */
export default function ReportesPage({ searchParams }: PageProps<"/reportes">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ModuleGate href="/reportes">
        <section className="flex max-w-6xl flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
            <p className="text-pretty text-muted-foreground">
              Histórico de certificados emitidos, con estadísticas por periodo y exportación para Excel y Power BI.
            </p>
          </header>
          <Report searchParams={searchParams} />
        </section>
      </ModuleGate>
    </Suspense>
  );
}

async function Report({ searchParams }: Pick<PageProps<"/reportes">, "searchParams">) {
  const [params, user] = await Promise.all([searchParams, requireUser()]);
  const today = plantToday(new Date());
  const filters = parseReportFilters(params, today);
  const [rows, clients] = await Promise.all([loadReportRows(filters), listReportClients()]);

  // Statistics use the period and client. The state filter only narrows the table and the export
  const stats = summarize(rows);
  const table = paginate(filterByStatus(rows, filters.status), filters.page);
  // RF-01. Query users cannot open /certificados, so their folio opens the PDF instead
  const canOpenDetail = canAccess(user.role, "/certificados");
  const pageHref = (page: number) => `/reportes?${reportQuery({ ...filters, page })}`;

  return (
    <>
      <div className="flex flex-col gap-4">
        <ReportFilterBar filters={filters} today={today} clients={clients} />
        <p className="text-sm text-muted-foreground">
          {filters.from || filters.to
            ? `Emitidos ${filters.from ? `del ${formatDate(filters.from)}` : "desde el inicio"} ${filters.to ? `al ${formatDate(filters.to)}` : "a la fecha"}.`
            : "Todos los certificados emitidos."}{" "}
          Las estadísticas cuentan los certificados vigentes (emitidos y enviados); los cancelados se muestran aparte.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Certificados vigentes" value={formatNumber(stats.valid)} hint="Emitidos y enviados" />
        <Stat label="Cancelados" value={formatNumber(stats.cancelled)} hint="Se conservan en el histórico" />
        <Stat
          label="Con parámetros fuera de rango"
          value={`${formatNumber(stats.deviationRate)} %`}
          hint={`${formatNumber(stats.withDeviation)} de ${formatNumber(stats.valid)} vigentes`}
        />
        <Stat label="Entregas fallidas" value={formatNumber(stats.failedDeliveries)} hint="Intentos de envío sin éxito" />
      </dl>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Certificados por mes</CardTitle>
            <CardDescription>Según la fecha de emisión</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyChart data={certificatesByMonth(rows)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Certificados por cliente</CardTitle>
            <CardDescription>Vigentes, los diez clientes con más certificados</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientChart data={certificatesByClient(rows)} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-medium">
            Histórico <span className="text-sm font-normal text-muted-foreground tabular-nums">({table.total})</span>
          </h2>
          <ExportLinks filters={filters} />
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Folio</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Emitido</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Cliente</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Lote</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Estado</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Desviaciones</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Emitido por</th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <span className="sr-only">PDF</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.items.map((row) => (
                <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={canOpenDetail ? `/certificados/${row.id}` : `/certificados/${row.id}/pdf`}
                      className="font-mono text-xs font-medium underline-offset-4 hover:underline"
                    >
                      {row.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDateTime(row.issuedAt)}</td>
                  <td className="px-4 py-2.5">
                    {row.clientName} <span className="text-muted-foreground">· {row.sapKey}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {row.lotId} <span className="text-muted-foreground">· {row.inspectionSequence}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <CertificateStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    {row.deviations === 0 ? (
                      <span className="text-muted-foreground">Ninguna</span>
                    ) : (
                      <span className="text-destructive">{row.deviations}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{row.issuedByName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <a
                      href={`/certificados/${row.id}/pdf`}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
              {table.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No hay certificados con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {table.pageCount > 1 && (
          <nav aria-label="Paginación" className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground tabular-nums">
              Página {table.page} de {table.pageCount}
            </span>
            <div className="flex gap-3">
              {table.page > 1 && (
                <Link href={pageHref(table.page - 1)} className="underline-offset-4 hover:underline">
                  Anterior
                </Link>
              )}
              {table.page < table.pageCount && (
                <Link href={pageHref(table.page + 1)} className="underline-offset-4 hover:underline">
                  Siguiente
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
        <dd className="text-xs text-muted-foreground">{hint}</dd>
      </CardContent>
    </Card>
  );
}
