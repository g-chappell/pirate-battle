import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import {
  ApiError,
  applyItem,
  getCaptainTeam,
  getInventory,
  type CaptainSummary,
  type CaptainTeamApi,
  type InventoryEntryApi,
} from "./api";
import {
  applyInventoryOptimistic,
  buildCrewPickerOptions,
  type CrewPickerOption,
  groupInventoryByKind,
  type InventoryItemView,
  reconcileInventoryAfterApply,
} from "./inventoryView";

interface InventoryPageProps {
  captains: readonly CaptainSummary[];
  onOpenCaptain: (captain: CaptainSummary) => void;
}

interface UseModalState {
  item: InventoryItemView;
  captainId: string;
  crewId: string | null;
  team: CaptainTeamApi | null;
  teamLoading: boolean;
  teamError: string | null;
  submitting: boolean;
  submitError: string | null;
}

export function InventoryPage({ captains, onOpenCaptain }: InventoryPageProps): ReactElement {
  const [inventory, setInventory] = useState<InventoryEntryApi[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<UseModalState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getInventory();
        if (cancelled) return;
        setInventory(res.inventory);
      } catch (err) {
        if (cancelled) return;
        setLoadError(formatApiError(err, "Could not load inventory"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openModal(item: InventoryItemView): void {
    if (item.useMode === "training-redirect" || item.useMode === "unknown") return;
    const captainId = captains[0]?.id ?? "";
    setModal({
      item,
      captainId,
      crewId: null,
      team: null,
      teamLoading: false,
      teamError: null,
      submitting: false,
      submitError: null,
    });
    if (item.useMode === "needs-crew" && captainId) {
      void loadTeam(item, captainId);
    }
  }

  async function loadTeam(item: InventoryItemView, captainId: string): Promise<void> {
    setModal((prev) =>
      prev && prev.item.templateKey === item.templateKey
        ? { ...prev, captainId, team: null, crewId: null, teamLoading: true, teamError: null }
        : prev,
    );
    try {
      const team = await getCaptainTeam(captainId);
      setModal((prev) => {
        if (!prev || prev.item.templateKey !== item.templateKey) return prev;
        if (prev.captainId !== captainId) return prev;
        return {
          ...prev,
          team,
          teamLoading: false,
          crewId: team.crews[0]?.id ?? null,
        };
      });
    } catch (err) {
      setModal((prev) => {
        if (!prev || prev.item.templateKey !== item.templateKey) return prev;
        if (prev.captainId !== captainId) return prev;
        return {
          ...prev,
          teamLoading: false,
          teamError: formatApiError(err, "Could not load crews"),
        };
      });
    }
  }

  async function confirmUse(): Promise<void> {
    if (!modal || modal.submitting) return;
    if (modal.item.useMode === "needs-crew" && !modal.crewId) return;
    const templateKey = modal.item.templateKey;
    const before = inventory;
    setInventory((prev) => (prev ? applyInventoryOptimistic(prev, templateKey, -1) : prev));
    setModal((prev) => (prev ? { ...prev, submitting: true, submitError: null } : prev));
    try {
      const res = await applyItem(templateKey);
      setInventory((prev) =>
        prev ? reconcileInventoryAfterApply(prev, templateKey, res.remaining) : prev,
      );
      setModal(null);
    } catch (err) {
      setInventory(before);
      setModal((prev) =>
        prev
          ? {
              ...prev,
              submitting: false,
              submitError: formatApiError(err, "Could not apply item"),
            }
          : prev,
      );
    }
  }

  if (loadError && !inventory) {
    return (
      <section aria-labelledby="inventory-heading">
        <h2 id="inventory-heading">Inventory</h2>
        <p role="alert" style={{ color: "#b00" }}>
          {loadError}
        </p>
      </section>
    );
  }
  if (!inventory) {
    return (
      <section aria-labelledby="inventory-heading">
        <h2 id="inventory-heading">Inventory</h2>
        <p>Loading inventory…</p>
      </section>
    );
  }

  const groups = groupInventoryByKind(inventory);

  return (
    <section aria-labelledby="inventory-heading">
      <h2 id="inventory-heading">Inventory</h2>
      {groups.length === 0 ? (
        <p>No items yet. Win battles to earn drops.</p>
      ) : (
        groups.map((group) => (
          <article key={group.kind} style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginBottom: "0.4rem" }}>{group.label}</h3>
            <ul role="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {group.items.map((item) => (
                <InventoryRow
                  key={item.templateKey}
                  item={item}
                  hasCaptain={captains.length > 0}
                  onUse={() => openModal(item)}
                  onTrainRedirect={() => {
                    if (captains[0]) onOpenCaptain(captains[0]);
                  }}
                />
              ))}
            </ul>
          </article>
        ))
      )}

      {modal ? (
        <UseItemModal
          modal={modal}
          captains={captains}
          onClose={() => setModal(null)}
          onSelectCaptain={(captainId) => {
            void loadTeam(modal.item, captainId);
          }}
          onSelectCrew={(crewId) => setModal((prev) => (prev ? { ...prev, crewId } : prev))}
          onConfirm={() => void confirmUse()}
        />
      ) : null}
    </section>
  );
}

interface InventoryRowProps {
  item: InventoryItemView;
  hasCaptain: boolean;
  onUse: () => void;
  onTrainRedirect: () => void;
}

function InventoryRow({
  item,
  hasCaptain,
  onUse,
  onTrainRedirect,
}: InventoryRowProps): ReactElement {
  const name = item.template?.name ?? item.templateKey;
  const description = item.template?.description ?? null;
  return (
    <li
      data-testid={`inventory-item-${item.templateKey}`}
      style={{
        border: "1px solid #ccc",
        borderRadius: "0.3rem",
        padding: "0.55rem",
        marginBottom: "0.4rem",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "0.75rem",
        alignItems: "center",
      }}
    >
      <div>
        <strong>{name}</strong>{" "}
        <span style={{ color: "#555" }}>
          × <span data-testid={`inventory-qty-${item.templateKey}`}>{item.qty}</span>
        </span>
        {description ? (
          <div style={{ fontSize: "0.85rem", color: "#555", marginTop: "0.2rem" }}>
            {description}
          </div>
        ) : null}
      </div>
      <div>
        {item.useMode === "training-redirect" ? (
          <button
            type="button"
            onClick={onTrainRedirect}
            disabled={!hasCaptain}
            data-testid={`inventory-train-${item.templateKey}`}
          >
            Train crews →
          </button>
        ) : item.useMode === "unknown" ? (
          <span style={{ color: "#888", fontSize: "0.85rem" }}>Not usable</span>
        ) : (
          <button
            type="button"
            onClick={onUse}
            disabled={!hasCaptain || item.qty < 1}
            data-testid={`inventory-use-${item.templateKey}`}
          >
            Use
          </button>
        )}
      </div>
    </li>
  );
}

interface UseItemModalProps {
  modal: UseModalState;
  captains: readonly CaptainSummary[];
  onClose: () => void;
  onSelectCaptain: (captainId: string) => void;
  onSelectCrew: (crewId: string) => void;
  onConfirm: () => void;
}

function UseItemModal({
  modal,
  captains,
  onClose,
  onSelectCaptain,
  onSelectCrew,
  onConfirm,
}: UseItemModalProps): ReactElement {
  const item = modal.item;
  const itemName = item.template?.name ?? item.templateKey;
  const selectedCaptain = captains.find((c) => c.id === modal.captainId) ?? null;
  const crewOptions: CrewPickerOption[] = buildCrewPickerOptions(
    selectedCaptain ?? { id: modal.captainId, name: "", factionId: "" },
    modal.team,
  );
  const canConfirm =
    !modal.submitting &&
    (item.useMode === "no-crew" || (item.useMode === "needs-crew" && modal.crewId !== null));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="use-item-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "0.4rem",
          padding: "1.25rem",
          width: "min(28rem, 92vw)",
          boxShadow: "0 0.5rem 1.5rem rgba(0,0,0,0.2)",
        }}
      >
        <h3 id="use-item-title" style={{ marginTop: 0 }}>
          Use {itemName}
        </h3>
        {item.useMode === "needs-crew" ? (
          <>
            {captains.length > 1 ? (
              <label style={{ display: "block", marginBottom: "0.6rem" }}>
                Captain:{" "}
                <select
                  data-testid="modal-captain-select"
                  value={modal.captainId}
                  onChange={(e) => onSelectCaptain(e.target.value)}
                >
                  {captains.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {modal.teamLoading ? <p>Loading crews…</p> : null}
            {modal.teamError ? (
              <p role="alert" style={{ color: "#b00" }}>
                {modal.teamError}
              </p>
            ) : null}
            {!modal.teamLoading && !modal.teamError && crewOptions.length > 0 ? (
              <label style={{ display: "block", marginBottom: "0.6rem" }}>
                Apply to crew:{" "}
                <select
                  data-testid="modal-crew-select"
                  value={modal.crewId ?? ""}
                  onChange={(e) => onSelectCrew(e.target.value)}
                >
                  {crewOptions.map((opt) => (
                    <option key={opt.crewId} value={opt.crewId}>
                      {opt.templateKey} (Lv {opt.level})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!modal.teamLoading && !modal.teamError && crewOptions.length === 0 ? (
              <p style={{ color: "#555" }}>This captain has no crews to apply to.</p>
            ) : null}
          </>
        ) : (
          <p>Consume one {itemName}?</p>
        )}
        {modal.submitError ? (
          <p role="alert" style={{ color: "#b00" }}>
            {modal.submitError}
          </p>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" onClick={onClose} disabled={modal.submitting}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="modal-confirm"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {modal.submitting ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return `${fallback}: ${err.code ?? err.status}`;
  }
  return `${fallback}.`;
}
