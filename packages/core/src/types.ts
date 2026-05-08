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
}

export interface CrewSnapshot {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  affinity: Affinity;
  statuses: string[];
  moves: MoveDef[];
}

export interface BattleState {
  turn: number;
  activeA: CrewSnapshot;
  activeB: CrewSnapshot;
  benchA: CrewSnapshot[];
  benchB: CrewSnapshot[];
  log: string[];
  rngSeed: number;
  rngState: number;
}

export type Action =
  | { type: "move"; moveKey: string }
  | { type: "switch"; targetIndex: number }
  | { type: "forfeit" };
