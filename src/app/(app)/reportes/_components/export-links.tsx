import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { reportQuery, type ReportFilters } from "@/lib/domain/report";

/**
 * RF-07 · D-19. Download links for the history with the filters on screen. Plain links
 * to the export route, so they work without JavaScript and the browser saves the file.
 */
export function ExportLinks({ filters }: { filters: ReportFilters }) {
  const href = (formato: string) => `/reportes/exportar?${reportQuery({ ...filters, page: 1 }, { formato })}`;
  return (
    <div className="flex flex-wrap gap-2">
      <a href={href("xlsx")} download className={buttonVariants({ variant: "outline" })}>
        <Download aria-hidden />
        Exportar a Excel
      </a>
      <a href={href("csv")} download className={buttonVariants({ variant: "outline" })}>
        <Download aria-hidden />
        Exportar CSV
      </a>
    </div>
  );
}
