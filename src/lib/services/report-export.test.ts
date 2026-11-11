import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { ReportRow } from "@/lib/domain/report";
import { csvField, EXPORT_COLUMNS, toCsv, toXlsx } from "./report-export";

const base: ReportRow = {
  id: "CER-2026-000001",
  status: "sent",
  issuedAt: new Date("2026-11-05T18:30:00Z"),
  clientId: "11111111-1111-4111-8111-111111111111",
  clientName: 'Panadería "La Espiga", S.A.',
  sapKey: "PRUEBA01",
  clientRfc: "XAXX010101000",
  lotId: "L-PRUEBA-001",
  product: "Harina de trigo",
  inspectionSequence: "A",
  purchaseOrder: "OC-1",
  invoiceNumber: "F-10",
  quantityRequested: 1000,
  quantityDelivered: 950.5,
  shippedOn: "2026-11-06",
  issuedByName: "Usuario Demo",
  cancelledAt: null,
  cancellationReason: null,
  deviations: 2,
  failedDeliveries: 1,
};

describe("RF-07 / D-19 CSV export", () => {
  it("RF-07 escapes quotes, commas and line breaks", () => {
    expect(csvField("simple")).toBe("simple");
    expect(csvField('dice "hola"')).toBe('"dice ""hola"""');
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField("línea 1\nlínea 2")).toBe('"línea 1\nlínea 2"');
    expect(csvField(null)).toBe("");
    expect(csvField(950.5)).toBe("950.5");
  });

  it("RF-07 neutralizes text a spreadsheet would run as a formula", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+52 55")).toBe("'+52 55");
    expect(csvField("-1,2")).toBe(`"'-1,2"`);
    expect(csvField("@cmd")).toBe("'@cmd");
    // Real numbers stay numbers
    expect(csvField(-3)).toBe("-3");
  });

  it("RF-07 writes a BOM, a Spanish header and one CRLF line per certificate", () => {
    const csv = toCsv([base, { ...base, id: "CER-2026-000002", status: "cancelled", cancellationReason: "Error, de captura" }]);
    expect(csv.startsWith("﻿Folio,Estado,Fecha de emisión,")).toBe(true);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Panadería ""La Espiga"", S.A."');
    expect(lines[1]).toContain("2026-11-05T18:30:00.000Z");
    expect(lines[1]).toContain(",2026-11-06,");
    expect(lines[2]).toContain("Cancelado");
    expect(lines[2].endsWith('"Error, de captura"')).toBe(true);
  });

  it("RF-07 an empty history still has the header", () => {
    expect(toCsv([]).trimEnd().split("\r\n")).toHaveLength(1);
  });
});

describe("RF-07 / D-19 xlsx export", () => {
  it("RF-07 keeps accents, real dates and numeric columns", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await toXlsx([base])).buffer as ArrayBuffer);
    const sheet = workbook.getWorksheet("Certificados")!;
    const col = (header: string) => EXPORT_COLUMNS.findIndex((c) => c.header === header) + 1;

    expect(sheet.getRow(1).getCell(col("Fecha de emisión")).value).toBe("Fecha de emisión");
    const data = sheet.getRow(2);
    expect(data.getCell(col("Cliente")).value).toBe('Panadería "La Espiga", S.A.');
    expect(data.getCell(col("Estado")).value).toBe("Enviado");
    // 18:30 UTC is 12:30 at the plant
    const issued = data.getCell(col("Fecha de emisión")).value;
    expect(issued).toBeInstanceOf(Date);
    expect((issued as Date).toISOString()).toBe("2026-11-05T12:30:00.000Z");
    expect(data.getCell(col("Fecha de envío")).value).toBeInstanceOf(Date);
    expect(data.getCell(col("Cantidad entregada")).value).toBe(950.5);
    expect(data.getCell(col("Parámetros fuera de rango")).value).toBe(2);
    expect(data.getCell(col("Fecha de cancelación")).value).toBeNull();
  });
});
