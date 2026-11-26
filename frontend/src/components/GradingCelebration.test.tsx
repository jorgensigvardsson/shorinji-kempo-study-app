import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CurrentGrade } from "../data";
import GradingCelebration from "./GradingCelebration";

function renderCelebration(initialGrade: CurrentGrade) {
    const save = vi.fn();
    function Profile() {
        const [grade, setGrade] = useState(initialGrade);
        return <GradingCelebration currentGrade={grade} onSetCurrentGrade={next => {
            save(next);
            setGrade(next);
        }} />;
    }
    render(<Profile />);
    return save;
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Jag har klarat min gradering!" }));
    return screen.getByRole("dialog");
};

describe("Grading celebration", () => {
    it("waits for confirmation, saves the next grade once and replays only the celebration", async () => {
        const user = userEvent.setup();
        const save = renderCelebration("1 kyū");
        const dialog = await open(user);
        expect(within(dialog).getByText("Har du klarat graderingen till Shodan?")).toBeTruthy();
        expect(save).not.toHaveBeenCalled();

        await user.click(within(dialog).getByRole("button", { name: "Ja, jag har klarat den!" }));
        expect(save).toHaveBeenCalledExactlyOnceWith("shodan");
        expect(within(dialog).getByRole("status").textContent).toContain("Shodan");
        expect(document.querySelector(".grading-confetti")).toBeTruthy();
        await user.click(within(dialog).getByRole("button", { name: "Fira igen!" }));
        expect(save).toHaveBeenCalledTimes(1);
        expect(within(dialog).getByRole("status").textContent).toContain("Shodan");

        await user.click(within(dialog).getByText("Stäng", { selector: "button" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(document.querySelector(".grading-confetti")).toBeNull();
        await open(user);
        expect(screen.getByText("Har du klarat graderingen till Nidan?")).toBeTruthy();
    });

    it("lets a beginner cancel without changing their grade", async () => {
        const user = userEvent.setup();
        const save = renderCelebration("minarai");
        const dialog = await open(user);
        expect(within(dialog).getByText("Har du klarat graderingen till 6 kyū?")).toBeTruthy();
        await user.click(within(dialog).getByRole("button", { name: "Avbryt" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(save).not.toHaveBeenCalled();
        expect(document.querySelector(".grading-confetti")).toBeNull();
    });

    it("keeps the final grade's celebration visible after updating the profile", async () => {
        const user = userEvent.setup();
        const save = renderCelebration("hachidan");
        const dialog = await open(user);
        await user.click(within(dialog).getByRole("button", { name: "Ja, jag har klarat den!" }));
        expect(save).toHaveBeenCalledExactlyOnceWith("kudan");
        expect(screen.getByRole("status").textContent).toContain("Kudan");
        await user.click(within(dialog).getByText("Stäng", { selector: "button" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(screen.queryByRole("button", { name: "Jag har klarat min gradering!" })).toBeNull();
    });
});
