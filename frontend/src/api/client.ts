// En tu compu (npm run dev) esto queda vacío y usa el proxy de Vite hacia
// http://localhost:4000. En Render, se define VITE_API_URL con la
// dirección pública del backend (ver README) y el build la usa acá.
const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getToken() {
  return localStorage.getItem("token");
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.toString() || `Error ${res.status}`);
  }

  return res.json();
}

async function uploadFile(path: string, file: File) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.toString() || `Error ${res.status}`);
  }

  return res.json();
}

async function downloadFile(path: string, fallbackFileName: string) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.toString() || `Error ${res.status}`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="(.+)"/);
  const fileName = match ? match[1] : fallbackFileName;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const api = {
  login: (username: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  dashboard: () => request("/dashboard"),
  searchAffiliates: (q: string) => request(`/affiliates/search?q=${encodeURIComponent(q)}`),
  listAffiliates: (params?: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const q = qs.toString();
    return request(`/affiliates${q ? `?${q}` : ""}`);
  },
  affiliateFilterOptions: () => request("/affiliates/filter-options"),
  listLoans: (params?: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const q = qs.toString();
    return request(`/loans${q ? `?${q}` : ""}`);
  },
  searchLoans: (q: string) => request(`/loans/search?q=${encodeURIComponent(q)}`),
  getAffiliate: (id: number) => request(`/affiliates/${id}`),
  createAffiliate: (data: unknown) =>
    request("/affiliates", { method: "POST", body: JSON.stringify(data) }),
  updateAffiliate: (id: number, data: unknown) =>
    request(`/affiliates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deactivateAffiliate: (id: number, data?: { date?: string; note?: string }) =>
    request(`/affiliates/${id}/deactivate`, { method: "POST", body: JSON.stringify(data || {}) }),
  activateAffiliate: (id: number, data?: { date?: string; companyId?: number | null; note?: string }) =>
    request(`/affiliates/${id}/activate`, { method: "POST", body: JSON.stringify(data || {}) }),
  loansByAffiliate: (affiliateId: number) => request(`/loans/affiliate/${affiliateId}`),
  getLoan: (id: number) => request(`/loans/${id}`),
  createLoan: (data: unknown) => request("/loans", { method: "POST", body: JSON.stringify(data) }),
  updateLoan: (id: number, data: unknown) =>
    request(`/loans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  registerPayment: (data: unknown) =>
    request("/loans/payments", { method: "POST", body: JSON.stringify(data) }),
  downloadOrdenCompra: (loanId: number, orderNumber: string) =>
    downloadFile(`/loans/${loanId}/forms/orden-compra`, `orden-compra-${orderNumber}.pdf`),
  deleteLoan: (loanId: number) => request(`/loans/${loanId}`, { method: "DELETE" }),
  getInterestRates: () => request("/settings/interest-rate"),
  setInterestRate: (data: unknown) =>
    request("/settings/interest-rate", { method: "POST", body: JSON.stringify(data) }),
  getOrderCounter: () => request("/settings/order-counter"),
  setOrderCounter: (nextNumber: number) =>
    request("/settings/order-counter", { method: "POST", body: JSON.stringify({ nextNumber }) }),
  getClosingDay: () => request("/settings/closing-day"),
  setClosingDay: (closingDay: number | null) =>
    request("/settings/closing-day", { method: "POST", body: JSON.stringify({ closingDay }) }),
  getMembershipFees: () => request("/settings/membership-fees"),
  getServiceTypes: () => request("/services/types"),
  createServiceType: (data: { name: string; defaultAmount: number }) =>
    request("/services/types", { method: "POST", body: JSON.stringify(data) }),
  updateServiceType: (id: number, data: { name?: string; defaultAmount?: number; active?: boolean }) =>
    request(`/services/types/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  assignService: (data: { serviceTypeId: number; affiliateId?: number; dependentId?: number; amount: number }) =>
    request("/services/assign", { method: "POST", body: JSON.stringify(data) }),
  updatePersonService: (id: number, amount: number) =>
    request(`/services/assign/${id}`, { method: "PUT", body: JSON.stringify({ amount }) }),
  removePersonService: (id: number) => request(`/services/assign/${id}`, { method: "DELETE" }),
  setMembershipFee: (socioType: string, feeAmount: number) =>
    request("/settings/membership-fees", { method: "POST", body: JSON.stringify({ socioType, feeAmount }) }),
  listUsers: () => request("/users"),
  listRoles: () => request("/users/roles"),
  listPermissionKeys: () => request("/users/permissions"),
  createRole: (data: unknown) => request("/users/roles", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id: number, data: unknown) =>
    request(`/users/roles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRole: (id: number) => request(`/users/roles/${id}`, { method: "DELETE" }),
  changeUserRole: (id: number, roleId: number) =>
    request(`/users/${id}/role`, { method: "POST", body: JSON.stringify({ roleId }) }),
  createUser: (data: unknown) => request("/users", { method: "POST", body: JSON.stringify(data) }),
  toggleUserActive: (id: number) => request(`/users/${id}/toggle-active`, { method: "POST" }),
  resetUserPassword: (id: number, password: string) =>
    request(`/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  getUserPermissions: (id: number) => request(`/users/${id}/permissions`),
  setUserPermissions: (id: number, permissionKeys: string[], denyKeys: string[] = []) =>
    request(`/users/${id}/permissions`, { method: "POST", body: JSON.stringify({ permissionKeys, denyKeys }) }),
  listCompanies: () => request("/companies"),
  getCompany: (id: number) => request(`/companies/${id}`),
  createCompany: (data: unknown) => request("/companies", { method: "POST", body: JSON.stringify(data) }),
  updateCompany: (id: number, data: unknown) =>
    request(`/companies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleCompanyActive: (id: number) => request(`/companies/${id}/toggle-active`, { method: "POST" }),
  listAgreements: (kind?: string) => request(`/agreements${kind ? `?kind=${kind}` : ""}`),
  createAgreement: (data: unknown) => request("/agreements", { method: "POST", body: JSON.stringify(data) }),
  updateAgreement: (id: number, data: unknown) =>
    request(`/agreements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleAgreementActive: (id: number) => request(`/agreements/${id}/toggle-active`, { method: "POST" }),
  listInventoryItems: () => request("/inventory/items"),
  createInventoryItem: (data: unknown) => request("/inventory/items", { method: "POST", body: JSON.stringify(data) }),
  updateInventoryItem: (id: number, data: unknown) =>
    request(`/inventory/items/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleInventoryItemActive: (id: number) => request(`/inventory/items/${id}/toggle-active`, { method: "POST" }),
  listInventoryLoans: (params?: { itemId?: number; active?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.itemId) qs.set("itemId", String(params.itemId));
    if (params?.active) qs.set("active", "true");
    const s = qs.toString();
    return request(`/inventory/loans${s ? `?${s}` : ""}`);
  },
  createInventoryLoan: (data: unknown) => request("/inventory/loans", { method: "POST", body: JSON.stringify(data) }),
  returnInventoryLoan: (id: number, data?: { kmIn?: number; notes?: string }) =>
    request(`/inventory/loans/${id}/return`, { method: "POST", body: JSON.stringify(data || {}) }),
  createInventoryPurchase: (itemId: number, data: unknown) =>
    request(`/inventory/items/${itemId}/purchases`, { method: "POST", body: JSON.stringify(data) }),
  getInventorySummary: (month: string) => request(`/inventory/summary?month=${month}`),
  // ---- Cobranzas y caja ----
  financeAccounts: () => request("/finance/accounts"),
  createFinanceAccount: (data: unknown) => request("/finance/accounts", { method: "POST", body: JSON.stringify(data) }),
  updateFinanceAccount: (id: number, data: unknown) =>
    request(`/finance/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  financeCategories: () => request("/finance/categories"),
  createFinanceCategory: (data: unknown) => request("/finance/categories", { method: "POST", body: JSON.stringify(data) }),
  listMovements: (params: Record<string, string>) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "")).toString();
    return request(`/finance/movements${q ? `?${q}` : ""}`);
  },
  createMovement: (data: unknown) => request("/finance/movements", { method: "POST", body: JSON.stringify(data) }),
  voidMovement: (id: number, reason: string) =>
    request(`/finance/movements/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) }),
  uploadMovementAttachment: (id: number, file: File) => uploadFile(`/finance/movements/${id}/attachments`, file),
  downloadMovementAttachment: (id: number, attId: number, name: string) =>
    downloadFile(`/finance/movements/${id}/attachments/${attId}`, name),
  financeSummary: (from: string, to: string) => request(`/finance/summary?from=${from}&to=${to}`),
  downloadFinanceExport: (from: string, to: string) =>
    downloadFile(`/finance/export?from=${from}&to=${to}`, `caja-${from}-a-${to}.xlsx`),
  collectionPreview: (companyId: number, month: string) =>
    request(`/finance/collections/preview?companyId=${companyId}&month=${month}`),
  collectionsSummary: (month: string) => request(`/finance/collections/summary?month=${month}`),
  listCollections: (month: string) => request(`/finance/collections?month=${month}`),
  createCollection: (data: unknown) => request("/finance/collections", { method: "POST", body: JSON.stringify(data) }),
  voidCollection: (id: number, reason: string) =>
    request(`/finance/collections/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) }),
  importCompanies: (file: File) => uploadFile("/companies/import", file),
  importAffiliates: (file: File) => uploadFile("/affiliates/import", file),
  downloadCompanyReportExcel: (id: number, companyName: string) =>
    downloadFile(`/companies/${id}/report/excel`, `estado-afiliados-${companyName}.xlsx`),
  downloadCompanyLiquidacion: (id: number, companyName: string, month: string) =>
    downloadFile(`/companies/${id}/liquidacion?month=${month}`, `liquidacion-${companyName}-${month}.xlsx`),
  downloadCompanyReportPdf: (id: number, companyName: string) =>
    downloadFile(`/companies/${id}/report/pdf`, `estado-afiliados-${companyName}.pdf`),
  updateDependent: (affiliateId: number, depId: number, data: Record<string, unknown>) =>
    request(`/affiliates/${affiliateId}/dependents/${depId}`, { method: "PUT", body: JSON.stringify(data) }),
  createDependent: (affiliateId: number, data: unknown) =>
    request(`/affiliates/${affiliateId}/dependents`, { method: "POST", body: JSON.stringify(data) }),
  downloadFichaAlta: (affiliateId: number, name: string) =>
    downloadFile(`/affiliates/${affiliateId}/forms/alta`, `ficha-alta-${name}.pdf`),
  downloadFichaFamiliares: (affiliateId: number, name: string) =>
    downloadFile(`/affiliates/${affiliateId}/forms/familiares`, `ficha-familiares-${name}.pdf`),
  downloadLiquidacion: (
    affiliateId: number,
    name: string,
    extras: { obraSocial: number; cuotaMutual: number; sueldoBruto: number }
  ) => {
    const query = new URLSearchParams({
      obraSocial: String(extras.obraSocial),
      cuotaMutual: String(extras.cuotaMutual),
      sueldoBruto: String(extras.sueldoBruto),
    }).toString();
    return downloadFile(`/affiliates/${affiliateId}/forms/liquidacion?${query}`, `liquidacion-${name}.xlsx`);
  },
  getAuditLogs: (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return request(`/audit${query ? `?${query}` : ""}`);
  },
  getAuditEntityTypes: () => request("/audit/entity-types"),
};
