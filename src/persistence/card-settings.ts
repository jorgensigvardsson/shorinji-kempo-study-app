import { createContext } from "react";

export interface CardSettings {
    cardTextSize: number;
}

export const DefaultCardSettings: CardSettings = { cardTextSize: 1.4 };

export const CardSettingsContext = createContext<CardSettings>(DefaultCardSettings);
