import { useNavigate } from "react-router-dom";

export function useAppBack(fallback: string) {
    const navigate = useNavigate();
    return () => {
        // BrowserRouter starts its own history at index zero, including when a
        // user follows an external deep link. MemoryRouter has no browser index.
        if (window.history.state?.idx === 0) navigate(fallback);
        else navigate(-1);
    };
}
