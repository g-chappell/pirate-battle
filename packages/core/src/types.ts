export type Affinity = "kraken" | "ironclad" | "phantom" | "bloodborne";

export type MoveKind = "damage" | "status" | "buff";

export interface MoveDef {
  key: string;
  name: string;
  affinity: Affinity;
  basePower: number;
  accuracy: number;
  kind: MoveKind;
  statusEffect?: string;
  priority?: number;
}

export interface CrewSnapshot {
  templateKey: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  level: number;
  affinity: Affinity;
  statuses: string[];
  moves: MoveDef[];
}

export type Side = "A" | "B";

export type BattleEvent =
  | { kind: "switch"; side: Side; toIndex: number }
  | {
      kind: "move";
      side: Side;
      moveKey: string;
      damage: number;
      targetHpAfter: number;
      crit: boolean;
      effective: number;
    }
  | { kind: "miss"; side: Side; moveKey: string }
  | { kind: "stun_skip"; side: Side; moveKey: string }
  | { kind: "status_apply"; side: Side; status: string }
  | {
      kind: "status_tick";
      side: Side;
      status: string;
      damage: number;
      targetHpAfter: number;
    }
  | { kind: "faint"; side: Side }
  | { kind: "swap_required"; side: Side }
  | { kind: "forfeit"; side: Side }
  | { kind: "victory"; side: Side };

export interface BattleState {
  turn: number;
  activeA: CrewSnapshot;
  activeB: CrewSnapshot;
  benchA: CrewSnapshot[];
  benchB: CrewSnapshot[];
  log: BattleEvent[];
  rngSeed: number;
  rngState: number;
  pendingSwapA: boolean;
  pendingSwapB: boolean;
  winner: Side | null;
}

export type Action =
  | { type: "move"; moveKey: string }
  | { type: "switch"; targetIndex: number }
  | { type: "forfeit" };
