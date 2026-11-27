import { useEffect, useRef } from "react";
import { permissionLabels, translate } from "../utils/labels";

// Permisos agrupados por modulo. Cada grupo se despliega y tiene su propia tilde
// para marcar o desmarcar todos los permisos del modulo de una vez.
export const PERMISSION_GROUPS: { name: string; keys: string[] }[] = [
  { name: "Asociados", keys: ["affiliates.view", "affiliates.create", "affiliates.edit", "affiliates.deactivate"] },
  { name: "Órdenes de compra", keys: ["orders.view", "orders.create", "orders.sign", "orders.pay", "orders.setDate", "orders.delete"] },
  { name: "Empresas", keys: ["companies.view", "companies.manage"] },
  { name: "Farmacia", keys: ["pharmacy.view"] },
  { name: "Inventario", keys: ["inventory.view", "inventory.manage"] },
  { name: "Tesorería (Caja y Cobranzas)", keys: ["finance.view", "finance.manage"] },
  { name: "Convenios", keys: ["agreements.view", "agreements.manage"] },
  { name: "Configuración", keys: ["settings.view", "settings.manage"] },
  { name: "Usuarios y roles", keys: ["users.manage"] },
  { name: "Auditoría", keys: ["audit.view"] },
];

export type PermissionItem = { key: string; on: boolean; badge?: React.ReactNode };

function GroupCheckbox({ state, disabled, onChange }: { state: "all" | "some" | "none"; disabled?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={onChange}
      aria-label="Marcar o desmarcar todo el grupo"
    />
  );
}

export default function PermissionGroups({
  items,
  disabled,
  onToggle,
  onToggleMany,
}: {
  items: PermissionItem[];
  disabled?: boolean;
  onToggle: (key: string) => void;
  onToggleMany: (keys: string[], on: boolean) => void;
}) {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const known = new Set(PERMISSION_GROUPS.flatMap((g) => g.keys));
  const groups = [
    ...PERMISSION_GROUPS.map((g) => ({ name: g.name, keys: g.keys.filter((k) => byKey.has(k)) })),
    { name: "Otros", keys: items.map((i) => i.key).filter((k) => !known.has(k)) },
  ].filter((g) => g.keys.length > 0);

  return (
    <div>
      {groups.map((g) => {
        const onCount = g.keys.filter((k) => byKey.get(k)!.on).length;
        const state = onCount === 0 ? "none" : onCount === g.keys.length ? "all" : "some";
        return (
          <details
            key={g.name}
            open={state !== "none" || undefined}
            style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 8, background: "var(--surface)" }}
          >
            <summary style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", fontWeight: 600 }}>
              <GroupCheckbox state={state} disabled={disabled} onChange={() => onToggleMany(g.keys, state !== "all")} />
              <span style={{ flex: 1 }}>{g.name}</span>
              <span className="note" style={{ fontWeight: 400 }}>{onCount} de {g.keys.length}</span>
            </summary>
            <div style={{ padding: "0 12px 8px 36px" }}>
              {g.keys.map((k) => {
                const item = byKey.get(k)!;
                return (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid var(--line-soft)" }}>
                    <input type="checkbox" checked={item.on} disabled={disabled} onChange={() => onToggle(k)} />
                    <span style={{ flex: 1 }}>{translate(permissionLabels, k)}</span>
                    {item.badge}
                  </label>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
