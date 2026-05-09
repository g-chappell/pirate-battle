import { CREWS, type CrewTemplate } from "@pirate-battle/content";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { ApiError, createCaptain, type CaptainSummary } from "./api";
import { isReadyToSubmit, TEAM_SIZE, toggleSelection } from "./teamBuilder";

interface TeamBuilderProps {
  onCaptainCreated: (captain: CaptainSummary) => void;
}

const FACTION_OPTIONS = [
  { id: "kraken", label: "Order of the Kraken" },
  { id: "ironclad", label: "Ironclad Fleet" },
  { id: "phantom", label: "Phantom Watch" },
  { id: "bloodborne", label: "Bloodborne Crew" },
];

export function TeamBuilder({
  onCaptainCreated,
}: TeamBuilderProps): ReactElement {
  const [name, setName] = useState("");
  const [factionId, setFactionId] = useState(FACTION_OPTIONS[0]!.id);
  const [selection, setSelection] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crews = useMemo(() => CREWS, []);
  const ready = isReadyToSubmit(selection) && name.trim().length > 0;

  function handleToggle(key: string): void {
    setSelection((prev) => toggleSelection(prev, key));
  }

  async function handleSubmit(): Promise<void> {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const captain = await createCaptain({
        name: name.trim(),
        factionId,
        crewTemplateKeys: selection,
      });
      onCaptainCreated(captain);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `Could not create captain: ${err.code ?? err.status}`
          : "Could not create captain.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="team-builder-heading">
      <h2 id="team-builder-heading">Assemble your crew</h2>
      <p>
        Pick {TEAM_SIZE} crews from the starter roster. Selected:{" "}
        {selection.length}/{TEAM_SIZE}.
      </p>

      <fieldset style={{ border: "none", padding: 0, margin: "1rem 0" }}>
        <label
          htmlFor="captain-name"
          style={{ display: "block", marginBottom: "0.25rem" }}
        >
          Captain name
        </label>
        <input
          id="captain-name"
          type="text"
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Anne Bonny"
          style={{ padding: "0.4rem", width: "20rem", maxWidth: "100%" }}
        />

        <label
          htmlFor="captain-faction"
          style={{ display: "block", marginTop: "0.75rem" }}
        >
          Faction
        </label>
        <select
          id="captain-faction"
          value={factionId}
          onChange={(e) => setFactionId(e.target.value)}
          style={{ padding: "0.4rem", marginTop: "0.25rem" }}
        >
          {FACTION_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </fieldset>

      <ul
        role="list"
        style={{
          listStyle: "none",
          padding: 0,
          display: "grid",
          gap: "0.5rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))",
        }}
      >
        {crews.map((crew) => (
          <CrewCard
            key={crew.templateKey}
            crew={crew}
            selected={selection.includes(crew.templateKey)}
            disabled={
              !selection.includes(crew.templateKey) &&
              selection.length >= TEAM_SIZE
            }
            onToggle={() => handleToggle(crew.templateKey)}
          />
        ))}
      </ul>

      {error ? (
        <p role="alert" style={{ color: "#b00", marginTop: "1rem" }}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!ready || submitting}
        onClick={handleSubmit}
        style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}
      >
        {submitting ? "Saving…" : "Set sail"}
      </button>
    </section>
  );
}

interface CrewCardProps {
  crew: CrewTemplate;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function CrewCard({
  crew,
  selected,
  disabled,
  onToggle,
}: CrewCardProps): ReactElement {
  return (
    <li
      style={{
        border: selected ? "2px solid #2a6" : "1px solid #999",
        borderRadius: "0.4rem",
        padding: "0.6rem",
        background: selected ? "#eaf6ee" : "transparent",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <label style={{ display: "block", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          style={{ marginRight: "0.4rem" }}
        />
        <strong>{crew.name}</strong>{" "}
        <em style={{ color: "#555" }}>({crew.affinity})</em>
        <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
          HP {crew.baseStats.hp} · ATK {crew.baseStats.atk} · DEF{" "}
          {crew.baseStats.def} · SPD {crew.baseStats.spd}
        </div>
      </label>
    </li>
  );
}
