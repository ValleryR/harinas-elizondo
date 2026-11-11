import ExcelJS from "exceljs";
import { CERTIFICATE_STATUS_LABEL } from "@/lib/domain/certificate";
import type { ReportRow } from "@/lib/domain/report";

/**
 * RF-07 · D-19. Certificate history as `.xlsx` (typed columns, real dates, accents) and
 * as CSV, both readable by Excel and Power BI. Headers are user-facing, so Spanish.
 */

type Cell = string | number | Date | null;
type Column = { header: string; width: number; numFmt?: string; value: (row: ReportRow) => Cell };

const DATE_TIME = "dd/mm/yyyy hh:mm";
const DATE = "dd/mm/yyyy";

/** Spreadsheets have no time zone. Shift the instant so the cell shows plant time (UTC-6). */
const plantWallClock = (date: Date | null) => (date ? new Date(date.getTime() - 6 * 60 * 60 * 1000) : null);

const dateOnly = (value: string | null) => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export const EXPORT_COLUMNS: readonly Column[] = [
  { header: "Folio", width: 18, value: (r) => r.id },
  { header: "Estado", width: 12, value: (r) => CERTIFICATE_STATUS_LABEL[r.status] },
  { header: "Fecha de emisión", width: 18, numFmt: DATE_TIME, value: (r) => plantWallClock(r.issuedAt) },
  { header: "Clave SAP", width: 12, value: (r) => r.sapKey },
  { header: "Cliente", width: 36, value: (r) => r.clientName },
  { header: "RFC", width: 15, value: (r) => r.clientRfc },
  { header: "Lote", width: 16, value: (r) => r.lotId },
  { header: "Producto", width: 24, value: (r) => r.product },
  { header: "Inspección", width: 11, value: (r) => r.inspectionSequence },
  { header: "Orden de compra", width: 16, value: (r) => r.purchaseOrder },
  { header: "Factura", width: 14, value: (r) => r.invoiceNumber },
  { header: "Cantidad solicitada", width: 18, value: (r) => r.quantityRequested },
  { header: "Cantidad entregada", width: 18, value: (r) => r.quantityDelivered },
  { header: "Fecha de envío", width: 14, numFmt: DATE, value: (r) => dateOnly(r.shippedOn) },
  { header: "Parámetros fuera de rango", width: 22, value: (r) => r.deviations },
  { header: "Entregas fallidas", width: 16, value: (r) => r.failedDeliveries },
  { header: "Emitido por", width: 26, value: (r) => r.issuedByName },
  { header: "Fecha de cancelación", width: 20, numFmt: DATE_TIME, value: (r) => plantWallClock(r.cancelledAt) },
  { header: "Motivo de cancelación", width: 36, value: (r) => r.cancellationReason },
];

/**
 * One CSV field (RFC 4180). Quotes are doubled and the field is quoted when it has a
 * comma, a quote or a line break. Text that a spreadsheet would run as a formula
 * (starts with = + - @, tab or carriage return) gets a leading apostrophe.
 */
export function csvField(value: Cell): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  let text = value instanceof Date ? value.toISOString() : value;
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV with a UTF-8 BOM (so Excel reads accents) and CRLF line ends. Dates are ISO 8601. */
export function toCsv(rows: readonly ReportRow[]): string {
  const lines = [
    EXPORT_COLUMNS.map((c) => csvField(c.header)).join(","),
    ...rows.map((row) =>
      EXPORT_COLUMNS.map((c) => {
        // CSV keeps the real instant and the plain date, not the shifted spreadsheet value
        if (c.header === "Fecha de emisión") return csvField(row.issuedAt);
        if (c.header === "Fecha de cancelación") return csvField(row.cancelledAt);
        if (c.header === "Fecha de envío") return csvField(row.shippedOn);
        return csvField(c.value(row));
      }).join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** `.xlsx` with one sheet, a frozen bold header and typed cells. */
export async function toXlsx(rows: readonly ReportRow[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Certificados", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = EXPORT_COLUMNS.map((c) => ({
    header: c.header,
    width: c.width,
    style: c.numFmt ? { numFmt: c.numFmt } : {},
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(EXPORT_COLUMNS.map((c) => c.value(row)));
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
