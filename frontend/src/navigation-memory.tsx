import { useContext, type ReactNode } from "react";
import { BrowserStateScope, useBrowserState } from "./browser-state";
import { activityForUrl, availableActivities } from "./navigation";
import { TranslatorContext } from "./i18n";
import { NavigationMemory, defaultPins } from "./navigation-memory-context";

const validPins = (value: unknown): value is string[] => Array.isArray(value)
    && value.length <= 30 && value.every(item => typeof item === "string" && !!activityForUrl(item) && !item.includes("?"));

export function NavigationMemoryProvider({ account, children }: {
    account: string; children: ReactNode;
}) {
    return <BrowserStateScope.Provider value={account}>
        <MemoryProvider key={account}>{children}</MemoryProvider>
    </BrowserStateScope.Provider>;
}

function MemoryProvider({ children }: { children: ReactNode }) {
    const translator = useContext(TranslatorContext);
    const [pins, setPins] = useBrowserState("pins", defaultPins, validPins, true);
    const available = availableActivities(translator.isJapanese);

    return <NavigationMemory.Provider value={{
        pins: pins.filter(path => available.some(activity => activity.path === path)),
        togglePin: path => {
            if (available.some(activity => activity.path === path))
                setPins(pins.includes(path) ? pins.filter(pin => pin !== path) : [...pins, path]);
        },
    }}>{children}</NavigationMemory.Provider>;
}
