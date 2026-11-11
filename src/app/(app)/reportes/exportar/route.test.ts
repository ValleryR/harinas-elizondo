import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ requireRole: vi.fn(), loadReportRows: vi.fn(), recordAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireRole: mocked.requireRole,
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocked.recordAudit }));
vi.mock("../data", () => ({ loadReportRows: mocked.loadReportRows }));

import { ForbiddenError } from "@/lib/session";
import { GET } from "./route";

const user = { id: "u1", name: "Usuario Demo", email: "demo@example.test", role: "query", employeeId: "E-1" };
const certificate = {
  id: "CER-2026-000001",
  status: "sent",
  issuedAt: new Date("2026-11-05T18:30:00Z"),
  clientId: "11111111-1111-4111-8111-111111111111",
  clientName: "Panadería Demo",
  sapKey: "PRUEBA01",
  clientRfc: null,
  lotId: "L-PRUEBA-001",
  product: "Harina",
  inspectionSequence: "A",
  purchaseOrder: "OC-1",
  invoiceNumber: null,
  quantityRequested: null,
  quantityDelivered: null,
  shippedOn: null,
  issuedByName: null,
  cancelledAt: null,
  cancellationReason: null,
  deviations: 0,
  failedDeliveries: 0,
};
const request = (query = "") => new Request(`http://localhost/reportes/exportar${query}`);

describe("RF-01 / RF-07 report export authorization and audit", () => {
  beforeEach(() => vi.resetAllMocks());

  it("RF-01 preserves the login redirect without a session and exports nothing", async () => {
    mocked.requireRole.mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(GET(request())).rejects.toThrow("REDIRECT:/login");
    expect(mocked.loadReportRows).not.toHaveBeenCalled();
    expect(mocked.recordAudit).not.toHaveBeenCalled();
  });

  it("RF-01 answers 403 to a role that cannot read reports", async () => {
    mocked.requireRole.mockRejectedValue(new ForbiddenError("No tienes permiso para realizar esta acción."));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocked.loadReportRows).not.toHaveBeenCalled();
    expect(mocked.recordAudit).not.toHaveBeenCalled();
  });

  it("RF-01 allows transaction and query users, never an 'admin' role", async () => {
    mocked.requireRole.mockResolvedValue(user);
    mocked.loadReportRows.mockResolvedValue([]);
    await GET(request());
    expect(mocked.requireRole).toHaveBeenCalledWith("transaction", "query");
  });

  it("BR-AUD-01 writes one audit row per export with the format and filters", async () => {
    mocked.requireRole.mockResolvedValue(user);
    mocked.loadReportRows.mockResolvedValue([certificate, { ...certificate, id: "CER-2026-000002", status: "cancelled" }]);
    const response = await GET(request("?formato=csv&desde=2026-11-01&hasta=2026-11-30&estado=sent"));

    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="certificados-\d{4}-\d{2}-\d{2}\.csv"$/);
    const csv = await response.text();
    expect(csv).toContain("CER-2026-000001");
    // The state filter applies to the export
    expect(csv).not.toContain("CER-2026-000002");

    expect(mocked.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocked.recordAudit).toHaveBeenCalledWith({
      user,
      action: "export",
      entity: "certificate",
      entityId: "history",
      detail: {
        format: "csv",
        rows: 1,
        filters: { from: "2026-11-01", to: "2026-11-30", clientId: null, status: "sent" },
      },
    });
  });

  it("D-19 exports xlsx by default", async () => {
    mocked.requireRole.mockResolvedValue(user);
    mocked.loadReportRows.mockResolvedValue([certificate]);
    const response = await GET(request("?periodo=todo"));
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const bytes = new Uint8Array(await response.arrayBuffer());
    // xlsx is a zip archive
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    expect(mocked.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ format: "xlsx" }) }));
  });
});
