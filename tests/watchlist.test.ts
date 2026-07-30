import { describe, expect, test } from "vitest";
import {
  addCustomSector,
  deleteCustomSector,
  parseWatchlistConfig,
  toggleSector,
  updateCustomSector,
  WATCHLIST_SCHEMA_VERSION,
} from "../lib/watchlist";
import {
  PRESETS,
  applyPreset,
  findMatchingPresetId,
} from "../lib/presets";
import {
  createCustomSectorEditorState,
  customSectorEditorReducer,
} from "../lib/watchlist-editor";
import type { WatchlistConfig } from "../lib/types";

function config(): WatchlistConfig {
  return {
    version: WATCHLIST_SCHEMA_VERSION,
    sectors: {
      btc: { enabled: true },
      "custom-alpha": { enabled: true },
    },
    customSectors: [
      { id: "custom-alpha", name: "Alpha", coins: ["bitcoin"] },
    ],
  };
}

describe("watchlist persistence and immutable updates", () => {
  test("legacy unversioned storage migrates to the current schema", () => {
    const migrated = parseWatchlistConfig(
      {
        sectors: {
          btc: { enabled: false },
          "custom-alpha": { enabled: false },
        },
        customSectors: [
          { id: "custom-alpha", name: "Alpha", coins: ["BTC_USDT"] },
        ],
      },
      ["btc", "l1"],
    );

    expect(migrated.version).toBe(WATCHLIST_SCHEMA_VERSION);
    expect(migrated.sectors.btc.enabled).toBe(false);
    expect(migrated.sectors.l1.enabled).toBe(true);
    expect(migrated.sectors["custom-alpha"].enabled).toBe(false);
    expect(migrated.customSectors[0].coins).toEqual(["bitcoin"]);
  });

  test("an unknown future schema version degrades to defaults", () => {
    const parsed = parseWatchlistConfig(
      {
        version: 999,
        sectors: { btc: { enabled: false } },
        customSectors: [
          { id: "custom-alpha", name: "Alpha", coins: ["BTC_USDT"] },
        ],
      },
      ["btc", "l1"],
    );

    expect(parsed.sectors.btc.enabled).toBe(true);
    expect(parsed.sectors.l1.enabled).toBe(true);
    expect(parsed.customSectors).toEqual([]);
  });

  test("toggling a built-in sector preserves custom sectors", () => {
    const original = config();
    const next = toggleSector(original, "btc");

    expect(next.sectors.btc.enabled).toBe(false);
    expect(next.customSectors).toEqual(original.customSectors);
    expect(next.customSectors).not.toBe(original.customSectors);
    expect(original.sectors.btc.enabled).toBe(true);
  });

  test("custom-sector create, edit and delete are deterministic immutable updates", () => {
    const created = addCustomSector(config(), "  New  ", ["ethereum", "ethereum"]);
    const added = created.customSectors.at(-1)!;
    expect(added.name).toBe("New");
    expect(added.coins).toEqual(["ethereum"]);
    expect(created.sectors[added.id].enabled).toBe(true);

    const updated = updateCustomSector(created, added.id, "Edited", ["solana"]);
    expect(updated.customSectors.at(-1)).toMatchObject({
      id: added.id,
      name: "Edited",
      coins: ["solana"],
    });

    const deleted = deleteCustomSector(updated, added.id);
    expect(deleted.customSectors.some((sector) => sector.id === added.id)).toBe(false);
    expect(deleted.sectors[added.id]).toBeUndefined();
  });

  test("invalid custom-sector input never enters persisted state", () => {
    const original = config();
    expect(addCustomSector(original, "Bad", ["../../bitcoin"])).toBe(original);
    expect(updateCustomSector(original, "custom-alpha", "", ["bitcoin"])).toBe(
      original,
    );
  });

  test("presets update built-ins without changing custom-sector state", () => {
    const original = {
      ...config(),
      sectors: {
        btc: { enabled: true },
        l1: { enabled: true },
        pow: { enabled: true },
        rwa: { enabled: true },
        privacy: { enabled: true },
        "custom-alpha": { enabled: false },
      },
    };
    const defensive = PRESETS.find((preset) => preset.id === "defensive")!;
    const next = applyPreset(
      original,
      defensive,
      ["btc", "l1", "pow", "rwa", "privacy"],
    );

    expect(next.sectors.btc.enabled).toBe(true);
    expect(next.sectors.l1.enabled).toBe(false);
    expect(next.sectors["custom-alpha"].enabled).toBe(false);
    expect(next.customSectors).toEqual(original.customSectors);
    expect(findMatchingPresetId(next, ["btc", "l1", "pow", "rwa", "privacy"]))
      .toBe("defensive");
  });

  test("a stale preset label is derived again from the actual config", () => {
    const allEnabled = {
      ...config(),
      sectors: {
        btc: { enabled: true },
        l1: { enabled: true },
        "custom-alpha": { enabled: false },
      },
    };

    expect(findMatchingPresetId(allEnabled, ["btc", "l1"])).toBe("all");
  });
});

describe("custom-sector editor reducer", () => {
  test("closed, adding, editing and cancel are distinct states", () => {
    const closed = createCustomSectorEditorState();
    expect(closed.mode).toEqual({ kind: "closed" });

    const adding = customSectorEditorReducer(closed, { type: "start_add" });
    expect(adding.mode).toEqual({ kind: "adding" });

    const editing = customSectorEditorReducer(adding, {
      type: "start_edit",
      sector: { id: "custom-alpha", name: "Alpha", coins: ["bitcoin"] },
    });
    expect(editing).toMatchObject({
      mode: { kind: "editing", sectorId: "custom-alpha" },
      name: "Alpha",
      coins: ["bitcoin"],
    });

    const cancelled = customSectorEditorReducer(editing, { type: "close" });
    expect(cancelled).toEqual(closed);
  });

  test("coin selection does not mutate prior editor state", () => {
    const adding = customSectorEditorReducer(createCustomSectorEditorState(), {
      type: "start_add",
    });
    const selected = customSectorEditorReducer(adding, {
      type: "add_coin",
      assetId: "bitcoin",
    });

    expect(adding.coins).toEqual([]);
    expect(selected.coins).toEqual(["bitcoin"]);
    expect(
      customSectorEditorReducer(selected, {
        type: "add_coin",
        assetId: "bitcoin",
      }),
    ).toBe(selected);
  });
});
