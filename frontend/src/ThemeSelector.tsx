import { useTheme } from "./hooks";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="btn-group">
      <button
        className={`btn btn-outline-secondary ${theme === "light" && "active"}`}
        onClick={() => setTheme("light")}
      >
        Light
      </button>
      <button
        className={`btn btn-outline-secondary ${theme === "dark" && "active"}`}
        onClick={() => setTheme("dark")}
      >
        Dark
      </button>
      <button
        className={`btn btn-outline-secondary ${theme === "system" && "active"}`}
        onClick={() => setTheme("system")}
      >
        System
      </button>
    </div>
  );
}
