import type { TrainableStat } from "@pirate-battle/core";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import {
  ApiError,
  getCaptainTeam,
  trainCrew,
  type CaptainSummary,
  type CaptainTeamApi,
  type CaptainTeamCrewApi,
} from "./api";
import { buildCrewDetail, getChipCount, type CrewDetail } from "./crewDetail";
import { AFFINITY_COLORS } from "./phaser/affinity";

interface CaptainCrewsViewProps {
  captain: CaptainSummary;
  onBack: () => void;
}

export function CaptainCrewsView({ captain, onBack }: CaptainCrewsViewProps): ReactElement {
  const [team, setTeam] = useState<CaptainTeamApi | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trainingStat, setTrainingStat] = useState<TrainableStat | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const t = await getCaptainTeam(captain.id);
        if (cancelled) return;
        setTeam(t);
        setSelectedCrewId((prev) => prev ?? t.crews[0]?.id ?? null);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? `Could not load crews: ${err.code ?? err.status}`
            : "Could not load crews.";
        setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [captain.id]);

  async function handleTrain(crewId: string, stat: TrainableStat): Promise<void> {
    if (trainingStat) return;
    setTrainingStat(stat);
    setError(null);
    try {
      const res = await trainCrew(captain.id, crewId, stat);
      setTeam((prev) => {
        if (!prev) return prev;
        const crews = prev.crews.map((c) => (c.id === crewId ? res.crew : c));
        const others = prev.inventory.filter((i) => i.templateKey !== "training-chip");
        const inventory =
          res.remainingChips > 0
            ? [...others, { templateKey: "training-chip", qty: res.remainingChips }].sort((a, b) =>
                a.templateKey.localeCompare(b.templateKey),
              )
            : others;
        return { ...prev, crews, inventory };
      });
    } catch (err) {
      const msg =
        err instanceof ApiError ? `Training failed: ${err.code ?? err.status}` : "Training failed.";
      setError(msg);
    } finally {
      setTrainingStat(null);
    }
  }

  if (error && !team) {
    return (
      <section>
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <p role="alert" style={{ color: "#b00" }}>
          {error}
        </p>
      </section>
    );
  }
  if (!team) {
    return (
      <section>
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <p>Loading crews…</p>
      </section>
    );
  }

  const selectedCrew = team.crews.find((c) => c.id === selectedCrewId) ?? team.crews[0] ?? null;
  const detail = selectedCrew ? buildCrewDetail(selectedCrew) : null;
  const chips = getChipCount(team.inventory);

  return (
    <section aria-labelledby="crews-heading">
      <button type="button" onClick={onBack} style={{ marginBottom: "0.75rem" }}>
        ← Back to captains
      </button>
      <h2 id="crews-heading">
        {team.name} <em style={{ color: "#555", fontWeight: "normal" }}>({team.factionId})</em>
      </h2>
      <p>
        Training Chips available: <strong data-testid="chip-count">{chips}</strong>
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(18rem, 1fr) 2fr",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <ul role="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {team.crews.map((crew) => (
            <CrewListItem
              key={crew.id}
              crew={crew}
              selected={crew.id === selectedCrew?.id}
              onSelect={() => setSelectedCrewId(crew.id)}
            />
          ))}
        </ul>

        {detail ? (
          <CrewDetailPanel
            detail={detail}
            chipsAvailable={chips}
            trainingStat={trainingStat}
            onTrain={(stat) => handleTrain(detail.crewId, stat)}
          />
        ) : (
          <p>This captain has no crews.</p>
        )}
      </div>

      {error ? (
        <p role="alert" style={{ color: "#b00", marginTop: "1rem" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}

interface CrewListItemProps {
  crew: CaptainTeamCrewApi;
  selected: boolean;
  onSelect: () => void;
}

function CrewListItem({ crew, selected, onSelect }: CrewListItemProps): ReactElement {
  const detail = buildCrewDetail(crew);
  const name = detail?.template.name ?? crew.templateKey;
  const affinity = detail?.template.affinity;
  return (
    <li
      style={{
        border: selected ? "2px solid #2a6" : "1px solid #999",
        borderRadius: "0.3rem",
        background: selected ? "#eaf6ee" : "transparent",
        padding: "0.5rem",
        marginBottom: "0.4rem",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          background: "transparent",
          border: "none",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <strong>{name}</strong>
        {affinity ? <em style={{ color: "#555" }}> ({affinity})</em> : null}
        <div style={{ fontSize: "0.85rem", color: "#666" }}>Lv {crew.level}</div>
      </button>
    </li>
  );
}

interface CrewDetailPanelProps {
  detail: CrewDetail;
  chipsAvailable: number;
  trainingStat: TrainableStat | null;
  onTrain: (stat: TrainableStat) => void;
}

function CrewDetailPanel({
  detail,
  chipsAvailable,
  trainingStat,
  onTrain,
}: CrewDetailPanelProps): ReactElement {
  const colour = `#${AFFINITY_COLORS[detail.template.affinity].toString(16).padStart(6, "0")}`;
  return (
    <article
      aria-labelledby="crew-detail-heading"
      style={{ border: "1px solid #ccc", borderRadius: "0.4rem", padding: "0.9rem" }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          aria-hidden="true"
          data-testid="crew-sprite"
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "0.4rem",
            background: colour,
            flexShrink: 0,
          }}
        />
        <div>
          <h3 id="crew-detail-heading" style={{ margin: 0 }}>
            {detail.template.name}
          </h3>
          <div style={{ color: "#555", fontSize: "0.85rem" }}>
            Lv {detail.level} · {detail.template.affinity}
          </div>
        </div>
      </header>

      <p style={{ marginTop: "0.6rem", fontSize: "0.9rem" }}>{detail.template.lore}</p>

      <XpBar xp={detail.xp} xpForNext={detail.xpForNext} ratio={detail.xpRatio} />

      <h4 style={{ marginBottom: "0.3rem" }}>Stats</h4>
      <table style={{ width: "100%", fontSize: "0.9rem", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#555" }}>
            <th>Stat</th>
            <th>Base</th>
            <th>Trained</th>
            <th>Effective</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>HP</td>
            <td>{detail.hp.base}</td>
            <td>—</td>
            <td>{detail.hp.effective}</td>
            <td></td>
          </tr>
          {detail.rows.map((row) => (
            <tr key={row.stat}>
              <td>{row.stat.toUpperCase()}</td>
              <td>{row.base}</td>
              <td data-testid={`trained-${row.stat}`}>
                +{row.trained}/{row.cap}
              </td>
              <td>{row.effective}</td>
              <td>
                <button
                  type="button"
                  data-testid={`train-${row.stat}`}
                  disabled={!row.canTrain || chipsAvailable < 1 || trainingStat !== null}
                  onClick={() => onTrain(row.stat)}
                >
                  {trainingStat === row.stat ? "Training…" : `Train (-1 chip)`}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{ marginTop: "0.6rem", marginBottom: "0.3rem" }}>Moves</h4>
      <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
        {detail.moves.map((m) => (
          <li key={m.key}>{m.name}</li>
        ))}
      </ul>
    </article>
  );
}

function XpBar({
  xp,
  xpForNext,
  ratio,
}: {
  xp: number;
  xpForNext: number;
  ratio: number;
}): ReactElement {
  return (
    <div style={{ margin: "0.7rem 0" }}>
      <div style={{ fontSize: "0.8rem", color: "#555", marginBottom: "0.2rem" }}>
        XP {xp} / {xpForNext}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={xpForNext}
        aria-valuenow={xp}
        style={{ background: "#ddd", borderRadius: "0.2rem", overflow: "hidden", height: "0.5rem" }}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: "100%",
            background: "#2a6",
          }}
        />
      </div>
    </div>
  );
}
