import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizQuestion } from "./quiz-logic";

const question: QuizQuestion = {
  id: "question-1",
  question: "Vad heter tekniken?",
  questionArgs: [],
  alternatives: ["Rätt alternativ", "Fel alternativ"],
  correctAnswer: 0,
};

vi.mock("./quiz-logic", async () => {
  const actual = await vi.importActual<typeof import("./quiz-logic")>("./quiz-logic");
  return { ...actual, drawQuestion: () => question };
});

// Quiz reads the stored streak when its module is first loaded, so each test starts
// from a fresh module registry with localStorage already holding what it should see.
async function renderQuiz() {
  const { default: Quiz } = await import("./Quiz");
  return render(<Quiz myGrade="shodan" />);
}

// Both faces of the card carry the footer; they always show the same streak.
const streakValue = () => screen.getAllByText(/Streak:/)[0].textContent?.replace("Streak:", "").trim();

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  localStorage.clear();
});

describe("Quiz streak", () => {
  it("picks up the streak stored on this device", async () => {
    localStorage.setItem("quizStreakCurrent", "4");

    await renderQuiz();

    expect(streakValue()).toBe("4");
  });

  it("stores the streak so that leaving the quiz and coming back keeps it", async () => {
    const user = userEvent.setup();
    const first = await renderQuiz();

    await user.click(screen.getByLabelText("Rätt alternativ"));
    await user.click(screen.getByRole("button", { name: "Svara" }));
    expect(streakValue()).toBe("1");
    expect(localStorage.getItem("quizStreakCurrent")).toBe("1");

    first.unmount();
    await renderQuiz();

    expect(streakValue()).toBe("1");
  });

  it("stores the streak when it is broken, rather than leaving the old one behind", async () => {
    const user = userEvent.setup();
    localStorage.setItem("quizStreakCurrent", "7");
    const first = await renderQuiz();

    await user.click(screen.getByLabelText("Fel alternativ"));
    await user.click(screen.getByRole("button", { name: "Svara" }));
    expect(streakValue()).toBe("0");
    expect(localStorage.getItem("quizStreakCurrent")).toBe("0");

    first.unmount();
    await renderQuiz();

    expect(streakValue()).toBe("0");
  });

  it("starts the streak over when the answer is given away", async () => {
    const user = userEvent.setup();
    localStorage.setItem("quizStreakCurrent", "3");
    await renderQuiz();

    await user.click(screen.getByRole("button", { name: "Visa svar" }));

    expect(streakValue()).toBe("0");
    expect(localStorage.getItem("quizStreakCurrent")).toBe("0");
  });
});
