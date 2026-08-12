export type PracticeArea = "kihon" | "hokei" | "tanen-sotai" | "randori" | "embu";

export const isPracticeArea = (value: string | null): value is PracticeArea =>
    value === "kihon" || value === "hokei" || value === "tanen-sotai" || value === "randori" || value === "embu";
