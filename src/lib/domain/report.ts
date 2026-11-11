/**
 * RF-07 · UC-08. Pure rules for the Reportes module: filters read from the URL, period
 * presets, and the aggregations behind the KPI cards and charts. No database access here.
 *
 * Certificate states (D-25): drafts never appear in the history because they were never
 * issued. Cancelled certificates stay in the history but are counted apart, never as valid.
 */

export const REPORT_STATUSES = ["issued", "sent", "cancelled"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** One certificate of the history, as the table, the charts and the export need it. */
export type ReportRow = {
  id: string;
  status: ReportStatus;
  issuedAt: Date;
  clientId: string;
  clientName: string;
  sapKey: string;
  clientRfc: string | null;
  lotId: string;
  product: string;
  inspectionSequence: string;
  purchaseOrder: string;
  invoiceNumber: string | null;
  quantityRequested: number | null;
  quantityDelivered: number | null;
  /** 'YYYY-MM-DD' */
  shippedOn: string | null;
  issuedByName: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  /** Parameters out of range in the snapshot (`certificate_lines.deviation != 0`). */
  deviations: number;
  /** Delivery attempts that failed (`deliveries.succeeded = false`). */
  failedDeliveries: number;
};

// ---------------------------------------------------------------------------
// Period and filters
// ---------------------------------------------------------------------------

export type PeriodPreset = "month" | "quarter" | "year" | "all" | "custom";

/** URL values are user-facing, so they are Spanish. */
const PRESET_PARAM: Record<Exclude<PeriodPreset, "custom">, string> = {
  month: "mes",
  quarter: "trimestre",
  year: "anio",
  all: "todo",
};
const CUSTOM_PARAM = "personalizado";

export const PRESET_LABEL: Record<Exclude<PeriodPreset, "custom">, string> = {
  month: "Este mes",
  quarter: "Este trimestre",
  year: "Este año",
  all: "Todo",
};

export type ReportFilters = {
  preset: PeriodPreset;
  /** Inclusive 'YYYY-MM-DD' in plant time, or null for an open end. */
  from: string | null;
  to: string | null;
  clientId: string | null;
  status: ReportStatus | null;
  page: number;
};

/** The plant works in central Mexico time, UTC-6 all year (no daylight saving since 2022). */
const PLANT_OFFSET_MS = 6 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Today's date at the plant, 'YYYY-MM-DD'. */
export function plantToday(now: Date): string {
  return new Date(now.getTime() - PLANT_OFFSET_MS).toISOString().slice(0, 10);
}

/** A real calendar date in 'YYYY-MM-DD' form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** RF-07 configurable periods. Inclusive range of a preset, relative to `today`. */
export function presetRange(
  preset: Exclude<PeriodPreset, "custom">,
  today: string,
): { from: string | null; to: string | null } {
  const [y, m] = today.split("-").map(Number);
  const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
  switch (preset) {
    case "month":
      return { from: isoDate(y, m, 1), to: isoDate(y, m, lastDay(y, m)) };
    case "quarter": {
      const first = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: isoDate(y, first, 1), to: isoDate(y, first + 2, lastDay(y, first + 2)) };
    }
    case "year":
      return { from: isoDate(y, 1, 1), to: isoDate(y, 12, 31) };
    case "all":
      return { from: null, to: null };
  }
}

type RawParams = Record<string, string | string[] | undefined>;

function first(params: RawParams, key: string): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single ? single.trim() || undefined : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RF-07. Filters from the URL (`periodo`, `desde`, `hasta`, `cliente`, `estado`, `pagina`).
 * Anything invalid is dropped, never passed to the database. With no period the current
 * year is shown. A preset wins over typed dates; typed dates alone are a custom range.
 */
export function parseReportFilters(params: RawParams, today: string): ReportFilters {
  const periodParam = first(params, "periodo");
  const presetEntry = Object.entries(PRESET_PARAM).find(([, value]) => value === periodParam);
  const desde = first(params, "desde");
  const hasta = first(params, "hasta");

  let preset: PeriodPreset;
  let range: { from: string | null; to: string | null };
  if (presetEntry) {
    preset = presetEntry[0] as Exclude<PeriodPreset, "custom">;
    range = presetRange(preset, today);
  } else if (periodParam === CUSTOM_PARAM || desde || hasta) {
    let from = isIsoDate(desde) ? desde : null;
    let to = isIsoDate(hasta) ? hasta : null;
    if (from && to && from > to) [from, to] = [to, from];
    // A custom range with no dates is the same as "all"
    preset = from || to ? "custom" : "all";
    range = { from, to };
  } else {
    preset = "year";
    range = presetRange("year", today);
  }

  const clientId = first(params, "cliente");
  const status = first(params, "estado");
  const page = Number(first(params, "pagina"));
  return {
    preset,
    ...range,
    clientId: clientId && UUID.test(clientId) ? clientId : null,
    status: (REPORT_STATUSES as readonly string[]).includes(status ?? "") ? (status as ReportStatus) : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Query string for the filters, so every link and the export keep the same view. */
export function reportQuery(filters: ReportFilters, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams();
  if (filters.preset === "custom") {
    if (filters.from) query.set("desde", filters.from);
    if (filters.to) query.set("hasta", filters.to);
  } else {
    query.set("periodo", PRESET_PARAM[filters.preset]);
  }
  if (filters.clientId) query.set("cliente", filters.clientId);
  if (filters.status) query.set("estado", filters.status);
  if (filters.page > 1) query.set("pagina", String(filters.page));
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query.toString();
}

/**
 * Instants that bound `issuedAt` for an inclusive date range in plant time.
 * `endExclusive` is the first instant of the day after `to`.
 */
export function issuedAtBounds(from: string | null, to: string | null): { start: Date | null; endExclusive: Date | null } {
  const instant = (date: string, addDays: number) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + addDays) + PLANT_OFFSET_MS);
  };
  return { start: from ? instant(from, 0) : null, endExclusive: to ? instant(to, 1) : null };
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function filterByStatus<T extends { status: ReportStatus }>(rows: readonly T[], status: ReportStatus | null): T[] {
  return status ? rows.filter((row) => row.status === status) : [...rows];
}

export const REPORT_PAGE_SIZE = 20;

/** Page of the history. A page past the end falls back to the last one. */
export function paginate<T>(rows: readonly T[], page: number, size = REPORT_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    items: rows.slice((current - 1) * size, current * size),
    page: current,
    pageCount,
    total: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Statistics (RF-07)
// ---------------------------------------------------------------------------

type StatRow = Pick<ReportRow, "status" | "issuedAt" | "clientId" | "clientName" | "deviations" | "failedDeliveries">;

/** D-25. A cancelled certificate is kept in the history but is not a valid issued one. */
const isValid = (row: Pick<ReportRow, "status">) => row.status !== "cancelled";

export type ReportSummary = {
  /** Issued or sent, not cancelled. */
  valid: number;
  cancelled: number;
  /** Valid certificates with at least one parameter out of range. */
  withDeviation: number;
  /** Percentage of valid certificates with a deviation, one decimal. 0 when there are none. */
  deviationRate: number;
  /** Failed delivery attempts over every certificate in the period. */
  failedDeliveries: number;
};

export function summarize(rows: readonly StatRow[]): ReportSummary {
  const valid = rows.filter(isValid);
  const withDeviation = valid.filter((row) => row.deviations > 0).length;
  return {
    valid: valid.length,
    cancelled: rows.length - valid.length,
    withDeviation,
    deviationRate: valid.length ? Math.round((withDeviation / valid.length) * 1000) / 10 : 0,
    failedDeliveries: rows.reduce((sum, row) => sum + row.failedDeliveries, 0),
  };
}

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type MonthBucket = { month: string; label: string; valid: number; cancelled: number };

/**
 * Certificates per month of issue, in plant time, oldest first. Months with no
 * certificates between the first and the last one are filled with zeros.
 */
export function certificatesByMonth(rows: readonly StatRow[]): MonthBucket[] {
  const counts = new Map<string, { valid: number; cancelled: number }>();
  for (const row of rows) {
    const month = plantToday(row.issuedAt).slice(0, 7);
    const bucket = counts.get(month) ?? { valid: 0, cancelled: 0 };
    if (isValid(row)) bucket.valid++;
    else bucket.cancelled++;
    counts.set(month, bucket);
  }
  if (counts.size === 0) return [];

  const months = [...counts.keys()].sort();
  let [y, m] = months[0].split("-").map(Number);
  const last = months[months.length - 1];
  const buckets: MonthBucket[] = [];
  for (;;) {
    const month = `${y}-${pad(m)}`;
    buckets.push({ month, label: `${MONTH_LABELS[m - 1]} ${y}`, ...(counts.get(month) ?? { valid: 0, cancelled: 0 }) });
    if (month === last) return buckets;
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
}

export type ClientBucket = { clientId: string; clientName: string; valid: number; withDeviation: number };

/** Valid certificates per client, most first. Clients with only cancelled ones are left out. */
export function certificatesByClient(rows: readonly StatRow[], top = 10): ClientBucket[] {
  const buckets = new Map<string, ClientBucket>();
  for (const row of rows) {
    if (!isValid(row)) continue;
    const bucket =
      buckets.get(row.clientId) ?? { clientId: row.clientId, clientName: row.clientName, valid: 0, withDeviation: 0 };
    bucket.valid++;
    if (row.deviations > 0) bucket.withDeviation++;
    buckets.set(row.clientId, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => b.valid - a.valid || a.clientName.localeCompare(b.clientName, "es"))
    .slice(0, top);
}
