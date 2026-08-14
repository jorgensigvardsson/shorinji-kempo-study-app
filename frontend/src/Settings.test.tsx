import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";

// The account panel is not what these tests are about, and left alone it reaches for
// the auth service on every render.
vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    getBackendUserInfo: () => null,
    refreshBackendUserInfo: () => Promise.resolve(),
  }),
}));

import { TranslatorImplementation } from "./i18n";
import type { GradePlan } from "./data";
import { getAppDataStore } from "./persistence/store";

const plans = [{ grade: "6 kyū", weeks: [] }] as GradePlan[];
const translator = new TranslatorImplementation({}, "sv");

const renderSettings = () => render(
  <Settings
    translator={translator}
    nextGrade={plans[0]}
    allGradePlans={plans}
    textSize={1.1}
    onSetLanguage={() => {}}
    onSetGrade={() => {}}
    onSetTextSize={() => {}}
  />
);

const kenshiField = () => screen.getByLabelText("Kenshinummer");

describe("Settings — kenshi number", () => {
  beforeEach(() => {
    localStorage.clear();
    getAppDataStore().set("kenshiNumber", undefined);
  });

  it("stores a nine-digit number typed in for the first time", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(kenshiField(), "123456789");

    expect(getAppDataStore().get("kenshiNumber")).toBe("0123456789");
  });

  it("stores a ten-digit number typed in for the first time", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(kenshiField(), "1234567890");

    expect(getAppDataStore().get("kenshiNumber")).toBe("1234567890");
  });

  it("stores a number written with a hyphen or spaces between the groups", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(kenshiField(), "123-456789");
    expect(getAppDataStore().get("kenshiNumber")).toBe("0123456789");

    await user.clear(kenshiField());
    await user.type(kenshiField(), "1234 567890");
    expect(getAppDataStore().get("kenshiNumber")).toBe("1234567890");
  });

  it("groups a whole number when leaving the field", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(kenshiField(), "123456789");
    await user.tab();
    expect((kenshiField() as HTMLInputElement).value).toBe("123-456789");

    await user.clear(kenshiField());
    await user.type(kenshiField(), "1234567890");
    await user.tab();
    expect((kenshiField() as HTMLInputElement).value).toBe("1234-567890");
  });

  it("does not regroup while the number is still being typed", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(kenshiField(), "123456789");

    expect((kenshiField() as HTMLInputElement).value).toBe("123456789");
  });

  it("shows a stored number grouped, without the padded leading zero", () => {
    getAppDataStore().set("kenshiNumber", "0123456789");
    renderSettings();

    expect((kenshiField() as HTMLInputElement).value).toBe("123-456789");
  });

  it("shows a number saved before the ten-digit form as the same number", () => {
    // Nine digits is what documents written by earlier versions carry.
    getAppDataStore().setDocument({
      ...getAppDataStore().getDocument(),
      data: { ...getAppDataStore().getDocument().data, kenshiNumber: "123456789" },
    });
    renderSettings();

    expect(getAppDataStore().get("kenshiNumber")).toBe("0123456789");
    expect((kenshiField() as HTMLInputElement).value).toBe("123-456789");
  });

  it("says so instead of storing a number of a length no kenshi number has", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(kenshiField(), "12345");
    expect(screen.queryByText(/9 eller 10 siffror/)).toBeNull();

    await user.tab();
    expect(screen.getByText("Ett kenshinummer består av 9 eller 10 siffror, till exempel 123-456789.")).toBeTruthy();
    expect(getAppDataStore().get("kenshiNumber")).toBeUndefined();
  });

  it("says so instead of storing a number that is not digits", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(kenshiField(), "SWE-12345");

    expect(screen.getByText("Ett kenshinummer består bara av siffror.")).toBeTruthy();
    expect(getAppDataStore().get("kenshiNumber")).toBeUndefined();
  });

  it("keeps an existing number when it is edited into something invalid", async () => {
    const user = userEvent.setup();
    getAppDataStore().set("kenshiNumber", "0123456789");
    renderSettings();

    await user.type(kenshiField(), "x");

    expect(screen.getByText("Ett kenshinummer består bara av siffror.")).toBeTruthy();
    expect(getAppDataStore().get("kenshiNumber")).toBe("0123456789");
  });

  it("keeps an existing number while a correction is half made", async () => {
    const user = userEvent.setup();
    getAppDataStore().set("kenshiNumber", "0123456789");
    renderSettings();

    // A number missing its last digit is not one to store over the old one with.
    await user.type(kenshiField(), "{backspace}");
    expect(getAppDataStore().get("kenshiNumber")).toBe("0123456789");

    await user.type(kenshiField(), "0");
    expect(getAppDataStore().get("kenshiNumber")).toBe("0123456780");
  });

  it("clears the number when the field is emptied", async () => {
    const user = userEvent.setup();
    getAppDataStore().set("kenshiNumber", "0123456789");
    renderSettings();

    await user.clear(kenshiField());

    expect(getAppDataStore().get("kenshiNumber")).toBeUndefined();
  });

  it("shows a number that arrives from a sync while the page is open", () => {
    renderSettings();

    act(() => getAppDataStore().set("kenshiNumber", "1234567890"));

    expect((kenshiField() as HTMLInputElement).value).toBe("1234-567890");
  });
});
