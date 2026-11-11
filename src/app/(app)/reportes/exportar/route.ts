import { recordAudit } from "@/lib/audit";
import { filterByStatus, parseReportFilters, plantToday } from "@/lib/domain/report";
import { toCsv, toXlsx } from "@/lib/services/report-export";
import { ForbiddenError, requireRole } from "@/lib/session";
import { loadReportRows } from "../data";

/**
 * RF-07 · UC-08 · D-19. Downloads the certificate history with the same filters as the
 * screen, as `.xlsx` (default) or CSV (`?formato=csv`). Both roles can export (RF-01).
 * Every export writes an audit row with the filters used (BR-AUD-01).
 * Without a session `requireRole` redirects to /login.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireRole("transaction", "query");
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(error.message, { status: 403 });
    throw error;
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const format = params.formato === "csv" ? "csv" : "xlsx";
  const today = plantToday(new Date());
  const filters = parseReportFilters(params, today);
  const rows = filterByStatus(await loadReportRows(filters), filters.status);

  await recordAudit({
    user,
    action: "export",
    entity: "certificate",
    entityId: "history",
    detail: {
      format,
      rows: rows.length,
      filters: { from: filters.from, to: filters.to, clientId: filters.clientId, status: filters.status },
    },
  });

  const filename = `certificados-${today}.${format}`;
  const body = format === "csv" ? toCsv(rows) : await toXlsx(rows);
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type":
        format === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
