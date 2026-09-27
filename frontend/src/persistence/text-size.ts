export const DefaultTextSize = 1.1;
export const TextSizeStorageKey = "text-size";

export function applyTextSize(size: number): void {
    document.documentElement.style.fontSize = `${Math.round(size * 100)}%`;
    document.documentElement.dataset.textSize = String(Math.round(size * 10));
}
