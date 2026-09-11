import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import RouteContent from "./components/RouteContent";
import { TranslatorContext, TranslatorImplementation } from "./i18n";
import { getRoutes } from "./routes";
import type { GradePlan } from "./data";

const submitFeedback = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("./sync/manager", () => ({
  getSyncManager: () => ({
    getBackendUserInfo: () => ({ roles: [] }),
    submitFeedback,
  }),
}));

const gradePlan: GradePlan = { grade: "6 kyū", weeks: [] };

// App rebuilds its routes when background updates arrive, even while someone
// is typing. Exercise the real route registration as well as the form.
function FeedbackPage({ pendingRequests = 0 }: { pendingRequests?: number }) {
  const translator = new TranslatorImplementation({}, "sv");
  const routes = getRoutes(
    gradePlan, gradePlan, [gradePlan], translator, 1,
    () => {}, () => {}, () => {}, false, undefined, pendingRequests,
  );
  return (
    <MemoryRouter initialEntries={["/feedback"]}>
      <TranslatorContext.Provider value={translator}>
        <RouteContent routes={routes} translator={translator} />
      </TranslatorContext.Provider>
    </MemoryRouter>
  );
}

it("preserves feedback text, focus and cursor across background app updates", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<FeedbackPage />);
  const field = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: "Din feedback" });
  await user.type(field, "Det går");
  field.setSelectionRange(3, 3);

  rerender(<FeedbackPage pendingRequests={1} />);

  const current = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Din feedback" });
  expect(current.value).toBe("Det går");
  expect(current).toBe(field);
  expect(document.activeElement).toBe(field);
  expect(current.selectionStart).toBe(3);
  expect(current.selectionEnd).toBe(3);

  current.setSelectionRange(current.value.length, current.value.length);
  await user.keyboard(" att skriva nu.");
  await user.click(screen.getByRole("button", { name: "Skicka feedback" }));

  expect(submitFeedback).toHaveBeenCalledExactlyOnceWith("Det går att skriva nu.", "sv");
  await screen.findByText("Tack för din feedback!");
  await waitFor(() => expect(field.value).toBe(""));
});
