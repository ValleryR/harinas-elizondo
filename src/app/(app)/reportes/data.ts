import "server-only";
import { and, asc, count, desc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { certificateLines, certificates, clients, deliveries, inspections, lots, user } from "@/lib/db/schema";
import { issuedAtBounds, type ReportFilters, type ReportRow, type ReportStatus } from "@/lib/domain/report";
import { requireRole } from "@/lib/session";

/**
 * RF-07 · UC-08. Reads for the Reportes screen and the export. Each one checks the role
 * itself (RF-01): transaction and query users can read reports.
 */

/**
 * Certificate history for a period and client, newest first, with the deviation count
 * from the snapshot (D-10) and the failed deliveries. Drafts are never included because
 * they have not been issued. The state filter is applied by the caller, so the
 * statistics can still tell valid and cancelled certificates apart (D-25).
 */
export async function loadReportRows(filters: Pick<ReportFilters, "from" | "to" | "clientId">): Promise<ReportRow[]> {
  await requireRole("transaction", "query");
  const db = getDb();

  const { start, endExclusive } = issuedAtBounds(filters.from, filters.to);
  const where = and(
    ne(certificates.status, "draft"),
    isNotNull(certificates.issuedAt),
    start ? gte(certificates.issuedAt, start) : undefined,
    endExclusive ? lt(certificates.issuedAt, endExclusive) : undefined,
    filters.clientId ? eq(certificates.clientId, filters.clientId) : undefined,
  );

  const [rows, deviationRows, failedRows] = await Promise.all([
    db
      .select({
        id: certificates.id,
        status: certificates.status,
        issuedAt: certificates.issuedAt,
        clientId: certificates.clientId,
        clientName: clients.businessName,
        sapKey: clients.sapKey,
        clientRfc: clients.rfc,
        lotId: certificates.lotId,
        product: lots.product,
        inspectionSequence: inspections.sequence,
        purchaseOrder: certificates.purchaseOrder,
        invoiceNumber: certificates.invoiceNumber,
        quantityRequested: certificates.quantityRequested,
        quantityDelivered: certificates.quantityDelivered,
        shippedOn: certificates.shippedOn,
        issuedByName: user.name,
        cancelledAt: certificates.cancelledAt,
        cancellationReason: certificates.cancellationReason,
      })
      .from(certificates)
      .innerJoin(clients, eq(clients.id, certificates.clientId))
      .innerJoin(lots, eq(lots.id, certificates.lotId))
      .innerJoin(inspections, eq(inspections.id, certificates.inspectionId))
      .leftJoin(user, eq(user.id, certificates.issuedBy))
      .where(where)
      .orderBy(desc(certificates.issuedAt)),
    db
      .select({ certificateId: certificateLines.certificateId, n: count() })
      .from(certificateLines)
      .innerJoin(certificates, eq(certificates.id, certificateLines.certificateId))
      .where(and(where, ne(certificateLines.deviation, 0)))
      .groupBy(certificateLines.certificateId),
    db
      .select({ certificateId: deliveries.certificateId, n: count() })
      .from(deliveries)
      .innerJoin(certificates, eq(certificates.id, deliveries.certificateId))
      .where(and(where, eq(deliveries.succeeded, false)))
      .groupBy(deliveries.certificateId),
  ]);

  const deviations = new Map(deviationRows.map((r) => [r.certificateId, r.n]));
  const failed = new Map(failedRows.map((r) => [r.certificateId, r.n]));
  return rows.map((row) => ({
    ...row,
    // Guaranteed by the WHERE clause above
    status: row.status as ReportStatus,
    issuedAt: row.issuedAt as Date,
    deviations: deviations.get(row.id) ?? 0,
    failedDeliveries: failed.get(row.id) ?? 0,
  }));
}

/** Clients for the filter. Inactive ones are included because their history remains (RF-03). */
export async function listReportClients() {
  await requireRole("transaction", "query");
  return getDb()
    .select({ id: clients.id, sapKey: clients.sapKey, businessName: clients.businessName })
    .from(clients)
    .orderBy(asc(clients.businessName));
}
