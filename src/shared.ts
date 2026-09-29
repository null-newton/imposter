export const colors = [
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Pink",
  "Orange",
  "Purple",
  "Black",
  "White",
  "Cyan",
  "Lime",
  "Brown",
  "Maroon",
  "Rose",
  "Coral",
];
export const hex = [
  "#ef3340",
  "#2865f9",
  "#21ae65",
  "#f6d347",
  "#ef64b9",
  "#fb9134",
  "#9955ee",
  "#485368",
  "#e4edf5",
  "#35d5e4",
  "#a9e934",
  "#a37349",
  "#863b51",
  "#f5b6c9",
  "#fa7970",
];
export type Phase =
  | "LOBBY_WAITING"
  | "GAME_ACTIVE"
  | "MEETING_INTRO"
  | "MEETING_DISCUSSION"
  | "MEETING_VOTING"
  | "MEETING_RESULTS"
  | "GAME_ENDED";
export type Player = {
  id: string;
  name: string;
  color: string;
  deviceId?: string;
  connected: boolean;
  alive: boolean;
  order: number;
};
export type Settings = {
  discussion: number;
  voting: number;
  changes: boolean;
  anonymous: boolean;
  early: boolean;
};
export type Lobby = {
  id: string;
  name: string;
  version: number;
  epoch: number;
  hostDeviceId: string;
  players: Player[];
  reservations: Record<string, string>;
  phase: Phase;
  settings: Settings;
  deadline: number;
  caller?: string;
  meetingId?: string;
  votes: Record<string, string>;
  eligible: string[];
  result?: {
    counts: Record<string, number>;
    ejected: string | null;
    reason: string;
  };
  events: string[];
};
export type Snapshot = {
  lobby: Lobby | null;
  voted: string[];
  myVote?: string;
  serverTime: number;
};
export type Command = {
  type: string;
  version?: number;
  lobbyId?: string;
  epoch?: number;
  [key: string]: unknown;
};
