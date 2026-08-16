import { useContext, useState } from "react";
import { Modal } from "react-bootstrap";
import { Youtube } from "react-bootstrap-icons";
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
    /** Drops the box around the link, for places that already frame it themselves. */
    plain?: boolean;
}

const VideoLink = ({ video, className, plain }: VideoLinkProps) => {
    const translator = useContext(TranslatorContext);
    const [show, setShow] = useState(false);
    const id = youtubeId(video.url);

    const label = video.label ?? translator.translate("Video");

    return (
        <div className={[plain ? null : "p-2 border border-primary rounded", className].filter(Boolean).join(" ")}>
            <div style={{ display: "grid", gridTemplateColumns: video.label ? "1fr auto" : "1fr", alignItems: "center", gap: "0.5rem" }}>
                {video.label && <div role={id ? "button" : undefined}
                     style={{ minWidth: 0, cursor: id ? "pointer" : "default" }}
                     onClick={id ? () => setShow(true) : undefined}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                </div>}
                <a href={video.url} target="_blank" rel="noopener noreferrer"
                   className="text-primary text-decoration-none" style={{ display: "flex", alignItems: "center", justifySelf: video.label ? "auto" : "start", whiteSpace: "nowrap" }}>
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
