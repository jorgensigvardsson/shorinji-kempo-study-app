import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The code phase is reached by asking the backend to send a code, so the sync
// manager stands in for the auth service here.
const startEmailAuth = vi.fn();
vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    startEmailAuth,
    beginBackendAuthorization: () => {},
    verifyEmailCode: () => Promise.resolve({ ok: false, error: "invalid_code" }),
    completeEmailLogin: () => {},
  }),
}));

// Only the on-demand fetch is stubbed out — the rest of the module backs the
// translations hook. The assertions read the Swedish source text, so no section
// needs to have loaded.
vi.mock("./translations", async (importOriginal) => ({
  ...await importOriginal<typeof import("./translations")>(),
  ensureAllTranslations: () => Promise.resolve(),
}));

import { LoginScreen } from "./LoginScreen";

// The screen picks its language from the browser, and these assertions are
// written against the Swedish source text.
Object.defineProperty(navigator, "languages", { value: ["sv-SE"], configurable: true });

const reachCodePhase = async () => {
  const user = userEvent.setup();
  render(<LoginScreen />);
  await user.type(screen.getByLabelText("Din e-postadress"), "kenshi@example.org");
  await user.click(screen.getByRole("button", { name: "Logga in" }));
};

describe("LoginScreen — how long the code lasts", () => {
  beforeEach(() => {
    startEmailAuth.mockReset();
  });

  it("states the validity the server reported, not a number of its own", async () => {
    startEmailAuth.mockResolvedValue({ action: "existing", expiresInSeconds: 900 });

    await reachCodePhase();

    expect(await screen.findByText(/Koden är giltig i 15 minuter\./)).toBeTruthy();
  });

  // Down, never up: a code with 2½ minutes left is not a three-minute code.
  it("drops a part-minute rather than rounding it up", async () => {
    startEmailAuth.mockResolvedValue({ action: "existing", expiresInSeconds: 150 });

    await reachCodePhase();

    expect(await screen.findByText(/Koden är giltig i 2 minuter\./)).toBeTruthy();
  });

  it("words a one-minute code in the singular", async () => {
    startEmailAuth.mockResolvedValue({ action: "existing", expiresInSeconds: 60 });

    await reachCodePhase();

    expect(await screen.findByText(/Koden är giltig i en minut\./)).toBeTruthy();
  });

  it("leaves the validity out when the server didn't state one", async () => {
    startEmailAuth.mockResolvedValue({ action: "existing", expiresInSeconds: null });

    await reachCodePhase();

    expect(await screen.findByText(/Vi har skickat en verifieringskod/)).toBeTruthy();
    expect(screen.queryByText(/giltig i/)).toBeNull();
  });
});
