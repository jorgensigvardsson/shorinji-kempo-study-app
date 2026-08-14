import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { setAppData, useAppData } from "./use-app-data";
import { getAppDataStore } from "./store";

describe("useAppData", () => {
  beforeEach(() => {
    setAppData("grade", "shodan");
    setAppData("language", "sv");
  });

  it("returns the value currently in the store", () => {
    setAppData("grade", "nidan");

    const { result } = renderHook(() => useAppData("grade"));

    expect(result.current).toBe("nidan");
  });

  it("re-renders when the value changes, whoever writes it", () => {
    const { result } = renderHook(() => useAppData("grade"));

    // Not via setAppData: a sync merge writes straight to the store, and a
    // reader must see that just as it sees a write from the UI.
    act(() => getAppDataStore().set("grade", "sandan"));

    expect(result.current).toBe("sandan");
  });

  it("ignores changes to other keys", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useAppData("grade");
    });
    const rendersAfterMount = renders;

    act(() => setAppData("language", "en"));

    expect(result.current).toBe("shodan");
    expect(renders).toBe(rendersAfterMount);
  });

  it("stops listening once unmounted", () => {
    let renders = 0;
    const { unmount } = renderHook(() => {
      renders++;
      return useAppData("grade");
    });
    const rendersAtUnmount = renders;

    unmount();
    act(() => setAppData("grade", "yondan"));

    expect(renders).toBe(rendersAtUnmount);
  });

  it("keeps separate readers of the same key in step", () => {
    const first = renderHook(() => useAppData("language"));
    const second = renderHook(() => useAppData("language"));

    act(() => setAppData("language", "ja"));

    expect(first.result.current).toBe("ja");
    expect(second.result.current).toBe("ja");
  });
});
