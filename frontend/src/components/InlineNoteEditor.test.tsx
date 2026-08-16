import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import InlineNoteEditor from "./InlineNoteEditor";

const labels = {
  addLabel: "Lägg till",
  editLabel: "Redigera",
  inputLabel: "Anteckning",
  placeholder: "Skriv…",
};

const openEditor = async (props: Partial<React.ComponentProps<typeof InlineNoteEditor>> = {}) => {
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(<InlineNoteEditor value="" onSave={onSave} {...labels} {...props} />);
  await user.click(screen.getByRole("button", { name: "Lägg till" }));
  return { user, onSave, field: screen.getByRole("textbox", { name: "Anteckning" }) };
};

describe("InlineNoteEditor — the length limit", () => {
  it("does not mention a count while the note is nowhere near the limit", async () => {
    const { user, field } = await openEditor({ maxLength: 20 });
    await user.type(field, "kort");

    expect(screen.queryByText(/\//)).toBeNull();
  });

  it("shows the count once the note approaches the limit", async () => {
    const { user, field } = await openEditor({ maxLength: 10 });
    await user.type(field, "123456789");

    expect(screen.getByText("9 / 10")).toBeTruthy();
  });

  it("refuses the keystroke that would pass the limit", async () => {
    const { user, field } = await openEditor({ maxLength: 5 });
    await user.type(field, "abcdefghij");

    expect((field as HTMLTextAreaElement).value).toBe("abcde");
  });

  // maxLength on the element stops typing, not a paste on every browser, and says
  // nothing about a value arriving as a prop — so save cuts it as well.
  it("cuts an over-long draft on save rather than passing it on", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineNoteEditor value={"x".repeat(12)} onSave={onSave} maxLength={5} {...labels} />);

    await user.click(screen.getByRole("button", { name: "Redigera" }));
    await user.click(screen.getByRole("button", { name: "Spara" }));

    expect(onSave).toHaveBeenCalledWith("xxxxx");
  });

  it("leaves an editor with no limit alone", async () => {
    const { user, field } = await openEditor();
    await user.type(field, "hur långt som helst");

    expect((field as HTMLTextAreaElement).value).toBe("hur långt som helst");
    expect(screen.queryByText(/\//)).toBeNull();
  });
});
