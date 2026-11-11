import { describe, expect, it } from "vitest";
import {
  certificatesByClient,
  certificatesByMonth,
  filterByStatus,
  isIsoDate,
  issuedAtBounds,
  paginate,
  parseReportFilters,
  plantToday,
  presetRange,
  reportQuery,
  summarize,
  type ReportStatus,
} from "./report";

const TODAY = "2026-11-11";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<{ status: ReportStatus; issuedAt: string; clientId: string; clientName: string; deviations: number; failedDeliveries: number }> = {}) {
  return {
    status: over.status ?? "issued",
    issuedAt: new Date(over.issuedAt ?? "2026-11-05T18:00:00Z"),
    clientId: over.clientId ?? CLIENT_A,
    clientName: over.clientName ?? "Panadería Demo",
    deviations: over.deviations ?? 0,
    failedDeliveries: over.failedDeliveries ?? 0,
  };
}

describe("RF-07 period presets", () => {
  it("RF-07 month preset covers the whole current month", () => {
    expect(presetRange("month", TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(presetRange("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("RF-07 quarter preset covers the current quarter", () => {
    expect(presetRange("quarter", TODAY)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(presetRange("quarter", "2026-02-15")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("RF-07 year preset covers the current year and all has no bounds", () => {
    expect(presetRange("year", TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetRange("all", TODAY)).toEqual({ from: null, to: null });
  });

  it("RF-07 today is taken in plant time (UTC-6), not UTC", () => {
    expect(plantToday(new Date("2026-11-12T03:00:00Z"))).toBe("2026-11-11");
    expect(plantToday(new Date("2026-11-12T06:00:00Z"))).toBe("2026-11-12");
  });
});

describe("RF-07 filters from the URL", () => {
  it("RF-07 defaults to the current year with no filters", () => {
    expect(parseReportFilters({}, TODAY)).toEqual({
      preset: "year",
      from: "2026-01-01",
      to: "2026-12-31",
      clientId: null,
      status: null,
      page: 1,
    });
  });

  it("RF-07 reads preset, client, state and page", () => {
    const filters = parseReportFilters({ periodo: "mes", cliente: CLIENT_A, estado: "cancelled", pagina: "3" }, TODAY);
    expect(filters).toEqual({
      preset: "month",
      from: "2026-11-01",
      to: "2026-11-30",
      clientId: CLIENT_A,
      status: "cancelled",
      page: 3,
    });
  });

  it("RF-07 typed dates are a custom range and are swapped when reversed", () => {
    expect(parseReportFilters({ periodo: "personalizado", desde: "2026-03-10", hasta: "2026-02-01" }, TODAY)).toMatchObject({
      preset: "custom",
      from: "2026-02-01",
      to: "2026-03-10",
    });
    expect(parseReportFilters({ desde: "2026-03-10" }, TODAY)).toMatchObject({ preset: "custom", from: "2026-03-10", to: null });
  });

  it("RF-07 a custom range with no dates shows everything", () => {
    expect(parseReportFilters({ periodo: "personalizado", desde: "", hasta: "" }, TODAY)).toMatchObject({
      preset: "all",
      from: null,
      to: null,
    });
  });

  it("RF-07 drops invalid values instead of passing them to the database", () => {
    const filters = parseReportFilters(
      { desde: "2026-02-31", hasta: "ayer", cliente: "1' OR 1=1", estado: "draft", pagina: "-2" },
      TODAY,
    );
    expect(filters).toEqual({ preset: "all", from: null, to: null, clientId: null, status: null, page: 1 });
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });

  it("RF-07 filters round-trip through the URL", () => {
    for (const params of [
      { periodo: "trimestre", estado: "sent" },
      { desde: "2026-01-15", hasta: "2026-02-15", cliente: CLIENT_B, pagina: "2" },
      { periodo: "todo" },
    ]) {
      const filters = parseReportFilters(params, TODAY);
      const query = Object.fromEntries(new URLSearchParams(reportQuery(filters)));
      expect(parseReportFilters(query, TODAY)).toEqual(filters);
    }
    expect(reportQuery(parseReportFilters({ periodo: "mes" }, TODAY), { formato: "csv" })).toBe("periodo=mes&formato=csv");
  });

  it("RF-07 the range bounds issuedAt in plant time, end day included", () => {
    const { start, endExclusive } = issuedAtBounds("2026-11-01", "2026-11-30");
    expect(start?.toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(endExclusive?.toISOString()).toBe("2026-12-01T06:00:00.000Z");
    expect(issuedAtBounds(null, null)).toEqual({ start: null, endExclusive: null });
  });
});

describe("RF-07 history table", () => {
  it("RF-07 filters by state", () => {
    const rows = [row({ status: "issued" }), row({ status: "sent" }), row({ status: "cancelled" })];
    expect(filterByStatus(rows, "cancelled")).toHaveLength(1);
    expect(filterByStatus(rows, null)).toHaveLength(3);
  });

  it("RF-07 paginates and clamps a page past the end", () => {
    const rows = Array.from({ length: 45 }, (_, i) => i);
    expect(paginate(rows, 1)).toMatchObject({ page: 1, pageCount: 3, total: 45 });
    expect(paginate(rows, 3).items).toEqual([40, 41, 42, 43, 44]);
    expect(paginate(rows, 99).page).toBe(3);
    expect(paginate([], 1)).toMatchObject({ items: [], page: 1, pageCount: 1, total: 0 });
  });
});

describe("RF-07 statistics", () => {
  const rows = [
    row({ status: "issued", deviations: 2 }),
    row({ status: "sent", failedDeliveries: 2 }),
    row({ status: "sent" }),
    row({ status: "cancelled", deviations: 3, failedDeliveries: 1 }),
  ];

  it("RF-07 / D-25 cancelled certificates are not counted as valid", () => {
    expect(summarize(rows)).toMatchObject({ valid: 3, cancelled: 1 });
  });

  it("RF-07 deviation rate is over valid certificates only", () => {
    expect(summarize(rows)).toMatchObject({ withDeviation: 1, deviationRate: 33.3 });
    expect(summarize([]).deviationRate).toBe(0);
    expect(summarize([row({ status: "cancelled", deviations: 1 })]).deviationRate).toBe(0);
  });

  it("RF-06 / RF-07 failed deliveries add up every failed attempt", () => {
    expect(summarize(rows).failedDeliveries).toBe(3);
  });

  it("RF-07 groups by month of issue in plant time and fills empty months", () => {
    const buckets = certificatesByMonth([
      // 2026-09-01 03:00 UTC is still August 31 at the plant
      row({ issuedAt: "2026-09-01T03:00:00Z" }),
      row({ issuedAt: "2026-11-05T18:00:00Z" }),
      row({ issuedAt: "2026-11-06T18:00:00Z", status: "cancelled" }),
    ]);
    expect(buckets).toEqual([
      { month: "2026-08", label: "ago 2026", valid: 1, cancelled: 0 },
      { month: "2026-09", label: "sep 2026", valid: 0, cancelled: 0 },
      { month: "2026-10", label: "oct 2026", valid: 0, cancelled: 0 },
      { month: "2026-11", label: "nov 2026", valid: 1, cancelled: 1 },
    ]);
    expect(certificatesByMonth([])).toEqual([]);
  });

  it("RF-07 month buckets cross a year boundary", () => {
    const buckets = certificatesByMonth([row({ issuedAt: "2025-12-10T18:00:00Z" }), row({ issuedAt: "2026-01-10T18:00:00Z" })]);
    expect(buckets.map((b) => b.month)).toEqual(["2025-12", "2026-01"]);
  });

  it("RF-07 / D-25 groups valid certificates by client, most first", () => {
    const buckets = certificatesByClient([
      row({ clientId: CLIENT_A, clientName: "Panadería Demo", deviations: 1 }),
      row({ clientId: CLIENT_B, clientName: "Molinos Prueba" }),
      row({ clientId: CLIENT_B, clientName: "Molinos Prueba", status: "sent", deviations: 4 }),
      row({ clientId: CLIENT_B, clientName: "Molinos Prueba", status: "cancelled" }),
      row({ clientId: "c", clientName: "Solo Cancelados", status: "cancelled" }),
    ]);
    expect(buckets).toEqual([
      { clientId: CLIENT_B, clientName: "Molinos Prueba", valid: 2, withDeviation: 1 },
      { clientId: CLIENT_A, clientName: "Panadería Demo", valid: 1, withDeviation: 1 },
    ]);
    expect(certificatesByClient(buckets.length ? [row(), row({ clientId: CLIENT_B })] : [], 1)).toHaveLength(1);
  });
});
