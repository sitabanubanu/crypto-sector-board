import type { CustomSectorConfig } from "./types";

export type CustomSectorEditorMode =
  | { kind: "closed" }
  | { kind: "adding" }
  | { kind: "editing"; sectorId: string };

export interface CustomSectorEditorState {
  mode: CustomSectorEditorMode;
  name: string;
  coins: string[];
  query: string;
}

export type CustomSectorEditorAction =
  | { type: "start_add" }
  | { type: "start_edit"; sector: CustomSectorConfig }
  | { type: "close" }
  | { type: "set_name"; name: string }
  | { type: "set_query"; query: string }
  | { type: "add_coin"; assetId: string }
  | { type: "remove_coin"; assetId: string };

export function createCustomSectorEditorState(): CustomSectorEditorState {
  return {
    mode: { kind: "closed" },
    name: "",
    coins: [],
    query: "",
  };
}

export function customSectorEditorReducer(
  state: CustomSectorEditorState,
  action: CustomSectorEditorAction,
): CustomSectorEditorState {
  switch (action.type) {
    case "start_add":
      return {
        mode: { kind: "adding" },
        name: "",
        coins: [],
        query: "",
      };
    case "start_edit":
      return {
        mode: { kind: "editing", sectorId: action.sector.id },
        name: action.sector.name,
        coins: [...action.sector.coins],
        query: "",
      };
    case "close":
      return createCustomSectorEditorState();
    case "set_name":
      return { ...state, name: action.name };
    case "set_query":
      return { ...state, query: action.query };
    case "add_coin":
      if (state.coins.includes(action.assetId)) return state;
      return {
        ...state,
        coins: [...state.coins, action.assetId],
        query: "",
      };
    case "remove_coin":
      return {
        ...state,
        coins: state.coins.filter((coin) => coin !== action.assetId),
      };
  }
}
