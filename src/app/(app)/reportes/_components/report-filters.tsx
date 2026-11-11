import Form from "next/form";
import Link from "next/link";
import { controlClass, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CERTIFICATE_STATUS_LABEL } from "@/lib/domain/certificate";
import {
  PRESET_LABEL,
  presetRange,
  REPORT_STATUSES,
  reportQuery,
  type PeriodPreset,
  type ReportFilters,
} from "@/lib/domain/report";
import { cn } from "@/lib/utils";

const PRESETS = ["month", "quarter", "year", "all"] as const satisfies readonly PeriodPreset[];

/**
 * RF-07. Period presets as links and a GET form for a custom range, client and state.
 * Every choice lands in the URL, so a filtered view can be shared or bookmarked.
 */
export function ReportFilterBar({
  filters,
  today,
  clients,
}: {
  filters: ReportFilters;
  today: string;
  clients: { id: string; sapKey: string; businessName: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Periodo" className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => {
          const active = filters.preset === preset;
          const query = reportQuery({ ...filters, preset, ...presetRange(preset, today), page: 1 });
          return (
            <Link
              key={preset}
              href={`/reportes?${query}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-muted font-medium text-foreground",
              )}
            >
              {PRESET_LABEL[preset]}
            </Link>
          );
        })}
        {filters.preset === "custom" && (
          <span aria-current="page" className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium">
            Rango personalizado
          </span>
        )}
      </nav>

      <Form action="/reportes" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        {/* Typed dates are a custom range; with both empty it shows everything */}
        <input type="hidden" name="periodo" value="personalizado" />
        <FormField id="desde" label="Desde">
          <Input id="desde" name="desde" type="date" defaultValue={filters.from ?? ""} />
        </FormField>
        <FormField id="hasta" label="Hasta">
          <Input id="hasta" name="hasta" type="date" defaultValue={filters.to ?? ""} />
        </FormField>
        <FormField id="cliente" label="Cliente">
          <select id="cliente" name="cliente" defaultValue={filters.clientId ?? ""} className={cn(controlClass, "h-8")}>
            <option value="">Todos</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.businessName} · {c.sapKey}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="estado" label="Estado">
          <select id="estado" name="estado" defaultValue={filters.status ?? ""} className={cn(controlClass, "h-8")}>
            <option value="">Todos</option>
            {REPORT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CERTIFICATE_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </FormField>
        <Button type="submit">Aplicar</Button>
      </Form>
    </div>
  );
}
