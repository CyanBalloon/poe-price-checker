import type { ItemIcon } from "./item-icons";
export type GameVersion = "poe1" | "poe2";

export interface HostConfig {
  shortcuts: ShortcutAction[];
  restoreClipboard: boolean;
  clientLog: string | null;
  gameConfig: string | null;
  stashScroll: boolean;
  logKeys: boolean;
  windowTitle: string;
  language: string;
  readClientLog: boolean;
  libraryAlpha: boolean;
  libraryOutputPath: string | null;
  autoUpdater: boolean;
  destroyHotkeyEnabled: boolean;
  autoClickerEnabled: boolean;
}

export interface ShortcutAction {
  shortcut: string;
  keepModKeys?: true;
  action:
  | {
    type: "copy-item";
    focusOverlay?: boolean;
    target: string;
  }
  | {
    type: "ocr-text";
    target: "heist-gems";
  }
  | {
    type: "trigger-event";
    target: string;
  }
  | {
    type: "stash-search";
    text: string;
  }

  | {
    type: "paste-in-chat";
    text: string;
    send: boolean;
  }
  | {
    type: "test-only";
  };
}

export type UpdateInfo =
  | { state: "initial" | "checking-for-update" | "update-not-available" | "error" | "installing" }
  | { state: "unavailable"; reason: "development" | "disabled" | "unsupported" }
  | { state: "update-available" | "update-downloaded"; version: string }
  | { state: "downloading"; version: string; percent: number };

export type UpdateAction = "check-for-update" | "download-update" | "update-and-restart";

export interface HostState {
  supportsAutoClicker: boolean;
  contents: string | null;
  version: string;
  updater: UpdateInfo;
  isLoggedIn: boolean;
}

export type IpcEvent =
  // events used by any type of Client:
  | IpcSaveConfig
  | IpcUpdaterState
  | IpcGameLog
  | IpcLogEntry
  | IpcHostConfig
  | IpcWidgetAction
  | IpcItemText
  | IpcOcrText
  | IpcConfigChanged
  | IpcUserAction
  | IpcWriteToFile
  | IpcReparseLog
  | IpcSaveCustomIcon
  | IpcCustomIconAdded
  | IpcAuthStatus
  | IpcConfirmDestroyAction
  | IpcConfirmDestroyResponse
  | IpcShowDestroyWarning;

export type IpcEventPayload<
  Name extends IpcEvent["name"],
  T extends IpcEvent = IpcEvent,
> = T extends { name: Name; payload: infer P } ? P : never;



type IpcHostConfig = Event<"CLIENT->MAIN::update-host-config", HostConfig>;



type IpcSaveConfig = Event<
  "CLIENT->MAIN::save-config",
  {
    contents: string;
    isTemporary: boolean;
  }
>;

type IpcConfigChanged = Event<
  "MAIN->CLIENT::config-changed",
  {
    contents: string;
  }
>;

type IpcLogEntry = Event<
  "MAIN->CLIENT::log-entry",
  {
    message: string;
  }
>;

type IpcWidgetAction = Event<
  "MAIN->CLIENT::widget-action",
  {
    target: string;
  }
>;

type IpcItemText = Event<
  "MAIN->CLIENT::item-text",
  {
    target: string;
    clipboard: string;
    item?: unknown;
    position: { x: number; y: number };
    focusOverlay: boolean;
    isManual?: boolean;
    activeGame?: GameVersion;
  }
>;

type IpcOcrText = Event<
  "MAIN->CLIENT::ocr-text",
  {
    target: string;
    pressTime: number;
    ocrTime: number;
    paragraphs: string[];
  }
>;

type IpcGameLog = Event<
  "MAIN->CLIENT::game-log",
  {
    lines: string[];
  }
>;

type IpcReparseLog = Event<"CLIENT->MAIN::re-parse-log">;

type IpcUpdaterState = Event<"MAIN->CLIENT::updater-state", UpdateInfo>;

// Hotkeyable actions are defined in `ShortcutAction`.
// Actions below are triggered by user interaction with the UI.
type IpcUserAction = Event<
  "CLIENT->MAIN::user-action",
  | {
    action: UpdateAction | "quit" | "poe-login" | "poe-logout";
  }
  | {
    action: "stash-search";
    text: string;
  }
  | {
    action: "whisper";
    text: string;
  }
>;

type IpcWriteToFile = Event<
  "CLIENT->MAIN::write-data",
  | {
    action: "log-item";
    text: string;
  }
  | {
    action: "session";
    start: boolean;
    name?: string;
    header?: string;
  }
  | {
    action: "client-log-event";
    data: ClientLogEvent;
    close: boolean;
  }
>;

export type ClientLogEvent =
  | GeneralLogEvent
  | LoadZoneEvent
  | LevelUpEvent
  | GameVersionEvent
  | AltTabEvent
  | NpcEvent
  | PlayerDeathEvent
  | PassiveTreeEvent
  | PermanentBonusEvent
  | SkillPointEvent
  | MapNavEvent
  | AfkEvent;

type BaseLogEvent = {
  ts: number;
  ms: number;
};

export type GeneralLogEvent = BaseLogEvent & {
  type: "log" | "game-start" | "login";
};

export type LoadZoneEvent = BaseLogEvent & {
  type: "load-zone";
  zone: string;
  areaLevel: number;
  seed: number;
};

export type LevelUpEvent = BaseLogEvent & {
  type: "level-up";
  charName: string;
  charClass: string;
  level: number;
};

export type GameVersionEvent = BaseLogEvent & {
  type: "game-version";
  version: string;
};

export type AltTabEvent = BaseLogEvent & {
  type: "alt-tab";
  gameFocused: boolean;
};

export type NpcEvent = BaseLogEvent & {
  type: "npc";
  npcName: string;
  message: string;
};

export type PlayerDeathEvent = BaseLogEvent & {
  type: "player-death";
  charName: string;
};

export type PassiveTreeEvent = BaseLogEvent & {
  type: "passive-tree";
  allocate: boolean;
  nodeId: string;
  nodeName: string;
};

export type PermanentBonusEvent = BaseLogEvent & {
  type: "permanent-bonus";
  permanentBonus: string;
  charName: string;
};

export type SkillPointEvent = BaseLogEvent & {
  type: "skill-point";
  points: number;
  pointType:
  | "passive"
  | "weapon-set"
  | "atlas"
  // all atlas sub trees
  | "map-boss"
  | "arbiter-boss"
  | "abyss"
  | "ritual"
  | "delirium"
  | "expedition"
  | "breach";
};

export type MapNavEvent = BaseLogEvent & {
  type: "map-nav";
  mapName: string;
};

export type AfkEvent = BaseLogEvent & {
  type: "afk";
  isAfk: boolean;
};

interface Event<TName extends string, TPayload = undefined> {
  name: TName;
  payload: TPayload;
}

type IpcSaveCustomIcon = Event<
  "CLIENT->MAIN::save-custom-icon",
  ItemIcon
>;

type IpcCustomIconAdded = Event<
  "MAIN->CLIENT::custom-icon-added",
  ItemIcon
>;

type IpcAuthStatus = Event<
  "MAIN->CLIENT::auth-state",
  {
    isLoggedIn: boolean;
  }
>;

type IpcConfirmDestroyAction = Event<
  "MAIN->CLIENT::confirm-destroy-action"
>;

type IpcConfirmDestroyResponse = Event<
  "CLIENT->MAIN::confirm-destroy-response",
  {
    activate: boolean;
  }
>;

type IpcShowDestroyWarning = Event<
  "MAIN->CLIENT::show-destroy-warning"
>;

