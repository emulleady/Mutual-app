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
  listAffiliates: () => request("/affiliates"),
  getAffiliate: (id: number) => request(`/affiliates/${id}`),
  createAffiliate: (data: unknown) =>
    request("/affiliates", { method: "POST", body: JSON.stringify(data) }),
  updateAffiliate: (id: number, data: unknown) =>
    request(`/affiliates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deactivateAffiliate: (id: number) =>
    request(`/affiliates/${id}/deactivate`, { method: "POST" }),
  activateAffiliate: (id: number) =>
    request(`/affiliates/${id}/activate`, { method: "POST" }),
  loansByAffiliate: (affiliateId: number) => request(`/loans/affiliate/${affiliateId}`),
  getLoan: (id: number) => request(`/loans/${id}`),
  createLoan: (data: unknown) => request("/loans", { method: "POST", body: JSON.stringify(data) }),
  registerPayment: (data: unknown) =>
    request("/loans/payments", { method: "POST", body: JSON.stringify(data) }),
  getInterestRates: () => request("/settings/interest-rate"),
  setInterestRate: (data: unknown) =>
    request("/settings/interest-rate", { method: "POST", body: JSON.stringify(data) }),
  listUsers: () => request("/users"),
  listRoles: () => request("/users/roles"),
  createUser: (data: unknown) => request("/users", { method: "POST", body: JSON.stringify(data) }),
  toggleUserActive: (id: number) => request(`/users/${id}/toggle-active`, { method: "POST" }),
  resetUserPassword: (id: number, password: string) =>
    request(`/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  listCompanies: () => request("/companies"),
  getCompany: (id: number) => request(`/companies/${id}`),
  createCompany: (data: unknown) => request("/companies", { method: "POST", body: JSON.stringify(data) }),
  updateCompany: (id: number, data: unknown) =>
    request(`/companies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleCompanyActive: (id: number) => request(`/companies/${id}/toggle-active`, { method: "POST" }),
  importAffiliates: (file: File) => uploadFile("/affiliates/import", file),
  downloadCompanyReportExcel: (id: number, companyName: string) =>
    downloadFile(`/companies/${id}/report/excel`, `estado-afiliados-${companyName}.xlsx`),
  downloadCompanyReportPdf: (id: number, companyName: string) =>
    downloadFile(`/companies/${id}/report/pdf`, `estado-afiliados-${companyName}.pdf`),
  createDependent: (affiliateId: number, data: unknown) =>
    request(`/affiliates/${affiliateId}/dependents`, { method: "POST", body: JSON.stringify(data) }),
  downloadFichaAlta: (affiliateId: number, name: string) =>
    downloadFile(`/affiliates/${affiliateId}/forms/alta`, `ficha-alta-${name}.pdf`),
  downloadFichaFamiliares: (affiliateId: number, name: string) =>
    downloadFile(`/affiliates/${affiliateId}/forms/familiares`, `ficha-familiares-${name}.pdf`),
  getAuditLogs: (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return request(`/audit${query ? `?${query}` : ""}`);
  },
  getAuditEntityTypes: () => request("/audit/entity-types"),
};
