import { useContext, useState } from "react";
import { Modal } from "react-bootstrap";
import { Film, PlayCircle, Youtube } from "react-bootstrap-icons";
import { noTranslate, TranslatorContext } from "../i18n";
import type { Video } from "../data";

const youtubeId = (url: string): string | null => {
    try {
        const u = new URL(url);
        if (u.hostname === "youtu.be")
            return u.pathname.slice(1) || null;
        return u.searchParams.get("v");
    } catch {
        return null;
    }
};

interface VideoLinkProps {
    video: Video;
    className?: string;
}

const VideoLink = ({ video, className }: VideoLinkProps) => {
    const translator = useContext(TranslatorContext);
    const [show, setShow] = useState(false);
    const id = youtubeId(video.url);

    const label = video.label ?? translator.translate("Video");

    return (
        <div className={`p-2 border border-primary rounded ${className ?? ""}`.trim()}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                    <Film className="text-primary" style={{ marginRight: "0.5em", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                </div>
                {id
                    ? <span role="button" className="text-primary" style={{ cursor: "pointer", display: "flex", alignItems: "center", whiteSpace: "nowrap" }}
                            onClick={() => setShow(true)}>
                        <PlayCircle style={{ marginRight: "0.35em", display: "block" }} />
                        {translator.translate("Visa")}
                      </span>
                    : <span />
                }
                <a href={video.url} target="_blank" rel="noopener noreferrer"
                   className="text-primary text-decoration-none" style={{ display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
                    <Youtube style={{ marginRight: "0.35em", display: "block" }} />
                    {noTranslate("YouTube")}
                </a>
            </div>
            {id && (
                <Modal show={show} onHide={() => setShow(false)} centered size="lg">
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: "1rem" }}>{label}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <div style={{ position: "relative", aspectRatio: "16 / 9" }}>
                            <iframe src={`https://www.youtube.com/embed/${id}`} title={label}
                                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen />
                        </div>
                    </Modal.Body>
                </Modal>
            )}
        </div>
    );
};

export default VideoLink;
