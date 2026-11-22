import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The account panel reaches for the auth service, which most of these tests have no
// interest in — and which the ones at the bottom are entirely about.
const getBackendUserInfo = vi.fn<() => { email: string; displayName: string; providers: string[]; roles: string[] } | null>(() => null);
const refreshBackendUserInfo = vi.fn<() => Promise<void>>(() => Promise.resolve());
const beginLinkAuthorization = vi.fn();
const exportAccount = vi.fn();
const deleteAccount = vi.fn();
const logoutOtherDevices = vi.fn();

vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({ getBackendUserInfo, refreshBackendUserInfo, beginLinkAuthorization, exportAccount, deleteAccount, logoutOtherDevices }),
}));

import Settings from "./Settings";

import { TranslatorImplementation } from "./i18n";
import { getAppDataStore } from "./persistence/store";

const translator = new TranslatorImplementation({}, "sv");
const onSetCurrentGrade = vi.fn();

const renderSettings = () => render(
  <Settings
    translator={translator}
    currentGrade="minarai"
    textSize={1.1}
    onSetLanguage={() => {}}
    onSetCurrentGrade={onSetCurrentGrade}
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

describe("Settings — profile and structure", () => {
  const account = { email: "malin@example.org", displayName: "Malin", providers: ["email"], roles: [] };

  beforeEach(() => {
    localStorage.clear();
    getAppDataStore().set("appDisplayName", null);
    getBackendUserInfo.mockReset().mockReturnValue(account);
    refreshBackendUserInfo.mockReset().mockResolvedValue();
    onSetCurrentGrade.mockReset();
  });

  it("offers every adult grade and saves the attained grade", async () => {
    const user = userEvent.setup();
    renderSettings();

    const grade = screen.getByLabelText("Min grad");
    expect(grade.textContent).toContain("Minarai");

    await user.click(grade);
    const choices = screen.getAllByRole("button")
      .filter(button => button.hasAttribute("data-rr-ui-dropdown-item"));
    expect(choices).toHaveLength(16);
    await user.click(choices.find(choice => /Nanadan/i.test(choice.textContent ?? ""))!);
    expect(onSetCurrentGrade).toHaveBeenCalledWith("nanadan");
  });

  it("prefills the app name from the signed-in account", () => {
    renderSettings();

    expect((screen.getByLabelText("Namn i appen") as HTMLInputElement).value).toBe("Malin");
  });

  it("stores an edited app name in the synchronized document", async () => {
    const user = userEvent.setup();
    renderSettings();

    const field = screen.getByLabelText("Namn i appen");
    await user.clear(field);
    await user.type(field, "  Mallan  ");
    await user.tab();

    expect(getAppDataStore().get("appDisplayName")).toBe("Mallan");
  });

  it("can return to using the account name", async () => {
    const user = userEvent.setup();
    getAppDataStore().set("appDisplayName", "Mallis");
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Använd kontots namn" }));

    expect(getAppDataStore().get("appDisplayName")).toBeNull();
    expect((screen.getByLabelText("Namn i appen") as HTMLInputElement).value).toBe("Malin");
  });

  it("previews each text-size option at the size it will use", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "Textstorlek" }));

    const smallPreview = parseFloat((screen.getByText("Liten") as HTMLElement).style.fontSize);
    const largestPreview = parseFloat((screen.getByText("Störst") as HTMLElement).style.fontSize);
    expect(smallPreview).toBeCloseTo(1 / 1.1);
    expect(largestPreview).toBeCloseTo(1.4 / 1.1);
  });

  it("groups settings under clear section headings", () => {
    renderSettings();

    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent))
      .toEqual(["Om mig", "Anpassa appen", "Dina uppgifter", "Felsökning"]);
    expect(screen.getByRole("button", { name: "Konto och inloggning", expanded: false })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sessioner" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Installera om appen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Installera om appen" })).toBeTruthy();
    expect(screen.queryByText("Dina personliga uppgifter och vad du tränar mot.")).toBeNull();
  });
});

describe("Settings — account and data actions", () => {
  beforeEach(() => {
    sessionStorage.clear();
    getBackendUserInfo.mockReturnValue({ email: "kenshi@example.org", displayName: "", providers: ["email"], roles: [] });
    refreshBackendUserInfo.mockResolvedValue();
    beginLinkAuthorization.mockReset();
    exportAccount.mockReset().mockResolvedValue(undefined);
    deleteAccount.mockReset().mockResolvedValue(undefined);
    logoutOtherDevices.mockReset().mockResolvedValue(undefined);
  });

  it("opens the sign-in form on request and links the supplied email", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "Konto och inloggning", expanded: false }));
    await user.click(screen.getByRole("button", { name: "Lägg till inloggningssätt", expanded: false }));
    expect(screen.getByRole("button", { name: "Lägg till inloggningssätt", expanded: true })).toBeTruthy();
    await user.type(screen.getByLabelText("E-postadress"), "another@example.org");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(beginLinkAuthorization).toHaveBeenCalledWith("another@example.org");
  });

  it("shows the account and sign-in form when returning from a successful link", async () => {
    sessionStorage.setItem("link_success", "1");
    renderSettings();
    expect(screen.getByRole("button", { name: "Konto och inloggning", expanded: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lägg till inloggningssätt", expanded: true })).toBeTruthy();
    expect(await screen.findByText("Konto länkat!")).toBeTruthy();
  });

  it("keeps account export distinct from a restorable backup", async () => {
    const user = userEvent.setup();
    renderSettings();
    const data = screen.getByRole("region", { name: "Dina uppgifter" });
    await user.click(within(data).getByRole("button", { name: "Ladda ner kontouppgifter", expanded: false }));
    expect(within(data).getByText(/Den här filen är till för insyn, inte för återläsning/)).toBeTruthy();
    await user.click(within(data).getByRole("button", { name: "Ladda ner kontokopia" }));
    expect(exportAccount).toHaveBeenCalledOnce();
  });

  it("still requires confirmation before deleting the account and supports cancellation", async () => {
    const user = userEvent.setup();
    renderSettings();
    const data = screen.getByRole("region", { name: "Dina uppgifter" });
    await user.click(within(data).getByRole("button", { name: "Radera konto" }));
    expect(deleteAccount).not.toHaveBeenCalled();
    await user.click(within(data).getByRole("button", { name: "Avbryt" }));
    expect(deleteAccount).not.toHaveBeenCalled();
    await user.click(within(data).getByRole("button", { name: "Radera konto" }));
    await user.click(within(data).getByRole("button", { name: "Ja, radera mitt konto" }));
    expect(deleteAccount).toHaveBeenCalledOnce();
  });

  it("keeps failed data actions and their explanation together", async () => {
    exportAccount.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderSettings();
    const data = screen.getByRole("region", { name: "Dina uppgifter" });
    await user.click(within(data).getByRole("button", { name: "Ladda ner kontouppgifter" }));
    await user.click(within(data).getByRole("button", { name: "Ladda ner kontokopia" }));
    expect(await within(data).findByRole("alert")).toHaveProperty("textContent", "Export misslyckades. Försök igen.");
  });

  it("still signs out other devices from the account section", async () => {
    const user = userEvent.setup();
    renderSettings();
    const account = screen.getByRole("region", { name: "Dina uppgifter" });
    await user.click(within(account).getByRole("button", { name: "Konto och inloggning" }));
    await user.click(within(account).getByRole("button", { name: "Logga ut på alla andra enheter" }));
    expect(logoutOtherDevices).toHaveBeenCalledOnce();
    expect(await within(account).findByText("Du har loggats ut på alla andra enheter.")).toBeTruthy();
  });
});

// The account panel has nothing of its own to show until /auth/me answers, and the
// auth service scales to zero: on the first visit in a while that answer is seconds
// away, not milliseconds.
describe("Settings — the account panel while the auth service answers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getAppDataStore().set("appDisplayName", null);
    getBackendUserInfo.mockReset().mockReturnValue(null);
    refreshBackendUserInfo.mockReset().mockReturnValue(new Promise(() => {}));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("says it is waiting rather than showing an empty account", () => {
    renderSettings();
    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.getByText("Laddar…")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Logga ut" })).toBeNull();
  });

  it("explains a wait long enough to be a service starting up", () => {
    renderSettings();
    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByText("Servern startar. Det kan ta en stund.")).toBeDefined();
  });

  it("shows the account once it arrives", async () => {
    const account = { email: "kenshi@example.org", displayName: "", providers: ["email"], roles: [] };
    let answer: () => void = () => {};
    refreshBackendUserInfo.mockReturnValue(new Promise<void>(resolve => {
      answer = () => { getBackendUserInfo.mockReturnValue(account); resolve(); };
    }));
    renderSettings();
    act(() => { vi.advanceTimersByTime(200); });

    await act(async () => { answer(); await vi.advanceTimersByTimeAsync(0); });

    expect(screen.getByText("kenshi@example.org")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Konto och inloggning" }));
    expect(screen.getByText("Ditt enda inloggningssätt")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Ta bort inloggningssätt" })).toBeNull();
    expect(screen.queryByText("Laddar…")).toBeNull();
  });

  it("offers removal only when another sign-in method will remain", async () => {
    const account = { email: "kenshi@example.org", displayName: "", providers: ["email", "google"], roles: [] };
    getBackendUserInfo.mockReturnValue(account);
    refreshBackendUserInfo.mockResolvedValue();
    renderSettings();

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    fireEvent.click(screen.getByRole("button", { name: "Konto och inloggning" }));
    expect(screen.getAllByRole("button", { name: "Ta bort inloggningssätt" })).toHaveLength(2);
    expect(screen.getByText(/kontot och dina studiedata kvar/)).toBeDefined();
  });

  // A wait that ends in nothing is not a wait any more. Leaving the spinner up
  // would promise an account that is never coming.
  it("says so when the account cannot be fetched at all", async () => {
    refreshBackendUserInfo.mockReturnValue(Promise.reject(new Error("offline")));
    renderSettings();

    await act(async () => { await vi.advanceTimersByTimeAsync(200); });

    expect(screen.getByText("Kunde inte hämta kontouppgifterna.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Logga ut" })).toBeDefined();
  });
});
