import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSavedViews,
  readSavedViews,
  writeSavedViews,
  storageKeyFor,
} from "./use-saved-views";

const SCOPE = "test-scope";

describe("storageKeyFor", () => {
  it("namespaces by scope so different list pages don't collide", () => {
    expect(storageKeyFor("invoices")).toBe("mba-tracker:saved-views:invoices");
    expect(storageKeyFor("mbas")).toBe("mba-tracker:saved-views:mbas");
  });
});

describe("readSavedViews", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns [] when nothing has been saved", () => {
    expect(readSavedViews(SCOPE)).toEqual([]);
  });

  it("returns [] when storage holds malformed JSON", () => {
    window.localStorage.setItem(storageKeyFor(SCOPE), "not json");
    expect(readSavedViews(SCOPE)).toEqual([]);
  });

  it("filters out entries missing required fields", () => {
    window.localStorage.setItem(
      storageKeyFor(SCOPE),
      JSON.stringify([
        { id: "ok", name: "Q1", query: "client=c1", createdAt: "2026-01-01" },
        { id: "bad" }, // missing fields
      ])
    );
    const views = readSavedViews(SCOPE);
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("ok");
  });
});

describe("useSavedViews", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty and reads existing storage on mount", () => {
    writeSavedViews(SCOPE, [
      { id: "v1", name: "MJFF", query: "client=mjff", createdAt: "x" },
    ]);
    const { result } = renderHook(() => useSavedViews(SCOPE));
    expect(result.current.views).toHaveLength(1);
  });

  it("saveView appends, persists, and returns the new view", () => {
    const { result } = renderHook(() => useSavedViews(SCOPE));
    let saved;
    act(() => {
      saved = result.current.saveView("MJFF Q1", "client=mjff&platform=META");
    });
    expect(saved).toMatchObject({ name: "MJFF Q1", query: "client=mjff&platform=META" });
    expect(result.current.views).toHaveLength(1);
    expect(readSavedViews(SCOPE)).toHaveLength(1);
  });

  it("deleteView removes by id and persists", () => {
    const { result } = renderHook(() => useSavedViews(SCOPE));
    let id = "";
    act(() => {
      id = result.current.saveView("temp", "x=1").id;
    });
    act(() => {
      result.current.deleteView(id);
    });
    expect(result.current.views).toEqual([]);
    expect(readSavedViews(SCOPE)).toEqual([]);
  });

  it("falls back to 'Untitled view' for blank names", () => {
    const { result } = renderHook(() => useSavedViews(SCOPE));
    let view;
    act(() => {
      view = result.current.saveView("   ", "x=1");
    });
    expect(view!.name).toBe("Untitled view");
  });
});
