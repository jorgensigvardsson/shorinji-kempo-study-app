import { useContext, useEffect, useState, type ReactNode } from "react";
import { Form } from "react-bootstrap";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { noTranslate, TranslatorContext } from "./i18n";
import type { KihonNode, WordListEntry } from "./data";
import { isText, useBrowserState } from "./browser-state";
import DisclosureChevron from "./components/DisclosureChevron";
import { kihonNodePath, kihonRoots, studyMeanings, studyNodeId, studySectionId, studyWord } from "./study-content";
import { kihonIntroduction, studyMaterial, type StudySection } from "./study-material";
import { deepeningPath, studyTopicFor, type ReadingTopicKey } from "./study-topics";
import "./StudyTopic.css";
import JapaneseReading from "./JapaneseReading";

const rootTitles = ["Kroppspositioner", "Fotpositioner", "Fotförflyttningar", "Kroppsrörelser", "Angrepp", "Försvar", "Försvarsmetoder"];
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

function StudyDisclosure({ stateKey, title, subtitle, children, defaultOpen = false, forced = false, id, headingLevel = 3 }: {
    stateKey: string; title: ReactNode; subtitle?: ReactNode; children: ReactNode;
    defaultOpen?: boolean; forced?: boolean; id?: string; headingLevel?: 2 | 3 | 4 | 5 | "none";
}) {
    const Heading = headingLevel === "none" ? "span" : headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : headingLevel === 4 ? "h4" : "h5";
    const headingClass = headingLevel === "none" ? undefined : headingLevel === 2 ? "app-view-heading" : headingLevel === 3 ? "app-section-heading" : "study-subsection-heading";
    const [storedOpen, setStoredOpen] = useBrowserState(`study-open:${stateKey}`, defaultOpen, isBoolean);
    const [followLink, setFollowLink] = useState(forced);
    const open = followLink || storedOpen;
    return <details id={id} className={`study-disclosure${headingLevel === 2 ? " study-chapter" : headingLevel === "none" ? " study-introduction" : ""}`} open={open} onToggle={event => {
        if (event.currentTarget.open === open) return;
        setFollowLink(false);
        setStoredOpen(event.currentTarget.open);
    }}>
        <summary>
            <div><Heading className={headingClass}>{title}</Heading>{subtitle && <div className="study-secondary">{subtitle}</div>}</div>
            <DisclosureChevron expanded={open} />
        </summary>
        <div className="study-disclosure-content">{children}</div>
    </details>;
}

function WordName({ word }: { word: WordListEntry }) {
    const translator = useContext(TranslatorContext);
    return <>
        <span>{noTranslate(translator.isJapanese && word.kanji ? word.kanji : word.romaji ?? word.kanji ?? "")}</span>
        {!translator.isJapanese && word.kanji && <span className="study-term-kanji">{noTranslate(word.kanji)}</span>}
    </>;
}

function StudyWords({ ids }: { ids: number[] }) {
    const translator = useContext(TranslatorContext);
    return <dl className="study-words">
        {ids.map(id => {
            const word = studyWord(id);
            return <div className="study-word" key={id} data-word-id={id}>
                <dt><WordName word={word} /></dt>
                <dd>{studyMeanings(word, translator).map(meaning => <p key={meaning}>{meaning}</p>)}</dd>
            </div>;
        })}
    </dl>;
}

function SectionContent({ section, depth = 4 }: { section: StudySection; depth?: number }) {
    const translator = useContext(TranslatorContext);
    const Heading = depth === 3 ? "h3" : depth === 4 ? "h4" : depth === 5 ? "h5" : "h6";
    return <>
        {section.key === "kana" && <JapaneseReading />}
        {section.paragraphs?.map(text => <p className="study-paragraph" key={text}>{translator.translate(text)}</p>)}
        {section.wordIds && <StudyWords ids={section.wordIds} />}
        {section.children?.map(child => <section className="study-subsection" id={studySectionId(child.key)} key={child.key}>
            <Heading className="study-subsection-heading">{translator.translate(child.title)}</Heading>
            {child.termId && <p className="study-secondary"><WordName word={studyWord(child.termId)} /></p>}
            <SectionContent section={child} depth={depth + 1} />
        </section>)}
    </>;
}

function containsSection(section: StudySection, key: string | null): boolean {
    return section.key === key || !!section.children?.some(child => containsSection(child, key));
}

function MaterialSections({ topic, target }: { topic: ReadingTopicKey; target: string | null }) {
    const translator = useContext(TranslatorContext);
    const followsKihon = topic === "movements";
    return <div className={`study-sections${followsKihon ? " study-complementary-sections" : ""}`} key={`${topic}:${target ?? ""}`}>
        {followsKihon && <p className="app-eyebrow-heading">{translator.translate("Fler uppslagsavsnitt")}</p>}
        {studyMaterial[topic].sections.map((section, index) => <StudyDisclosure
            key={`${section.key}:${target ?? ""}`} stateKey={`${topic}:${section.key}`}
            id={studySectionId(section.key)} title={translator.translate(section.title)}
            subtitle={section.termId ? <WordName word={studyWord(section.termId)} /> : undefined}
            headingLevel={followsKihon ? 2 : 3}
            defaultOpen={topic !== "movements" && index === 0} forced={containsSection(section, target)}>
            <SectionContent section={section} depth={followsKihon ? 3 : 4} />
        </StudyDisclosure>)}
    </div>;
}

function KihonName({ node }: { node: KihonNode | { name: string; kanji: string } }) {
    const translator = useContext(TranslatorContext);
    return <>
        <span>{noTranslate(translator.isJapanese ? node.kanji : node.name)}</span>
        {!translator.isJapanese && <span className="study-term-kanji">{noTranslate(node.kanji)}</span>}
    </>;
}

function KihonAnnotations({ node }: { node: KihonNode }) {
    const translator = useContext(TranslatorContext);
    return <>
        {node.note && <p className="study-paragraph study-secondary">{translator.translate(node.note)}</p>}
        {node.alsoKnownAs && <p className="study-alias">{translator.translate("Även kallad")} <KihonName node={node.alsoKnownAs} /></p>}
    </>;
}

function KihonChildren({ nodes, depth = 4, target }: { nodes: KihonNode[]; depth?: number; target: string | null }) {
    const translator = useContext(TranslatorContext);
    const Heading = depth === 3 ? "h3" : depth === 4 ? "h4" : depth === 5 ? "h5" : "h6";
    return <ul className="study-tree">
        {nodes.map(node => <li key={node.id} id={studyNodeId(node.id)} className={node.children?.length ? "study-branch" : "study-leaf"}>
            {node.children?.length ? <>
                <Heading className="study-subsection-heading"><KihonName node={node} /></Heading>
                {node.description && <p className="study-secondary">{translator.translate(node.description)}</p>}
                <KihonAnnotations node={node} />
                <KihonChildren nodes={node.children} depth={depth + 1} target={target} />
            </> : <div className={`study-word${node.id === target ? " study-target" : ""}`}>
                <div className="study-term"><KihonName node={node} /></div>
                <div>{node.description && <p>{translator.translate(node.description)}</p>}<KihonAnnotations node={node} /></div>
            </div>}
            {node.footnote && <p className="study-paragraph study-secondary">{translator.translate(node.footnote)}</p>}
        </li>)}
    </ul>;
}

function KihonStudy() {
    const translator = useContext(TranslatorContext);
    const [params, setParams] = useSearchParams();
    const [savedGroup, setSavedGroup] = useBrowserState("study-kihon-group", kihonRoots[0].id, isText);
    const target = params.get("node");
    const targetPath = target ? kihonNodePath(target) : [];
    const selected = kihonRoots.find(root => root.id === params.get("group"))
        ?? targetPath[0] ?? kihonRoots.find(root => root.id === savedGroup) ?? kihonRoots[0];
    const index = kihonRoots.indexOf(selected);
    const isTaiGamae = selected.id === "tai gamae [kihon]";
    const kamaeFamilies = isTaiGamae ? selected.children?.filter(node => node.id === "byakuren hachi jin" || node.id === "giwa kyū jin") ?? [] : [];
    const otherGroups = selected.children?.filter(node => !kamaeFamilies.includes(node)) ?? [];
    const renderGroup = (node: KihonNode, nodeIndex: number, headingLevel: 3 | 4 = 3) => <StudyDisclosure
        key={`${node.id}:${target ?? ""}`} stateKey={`kihon:${node.id}`} id={studyNodeId(node.id)} headingLevel={headingLevel}
        title={<KihonName node={node} />}
        subtitle={node.description ? translator.translate(node.description) : undefined}
        defaultOpen={!isTaiGamae && nodeIndex === 0} forced={targetPath.some(ancestor => ancestor.id === node.id)}>
        <KihonAnnotations node={node} />
        <KihonChildren nodes={node.children ?? []} depth={headingLevel + 1} target={target} />
        {node.footnote && <p className="study-paragraph study-secondary">{translator.translate(node.footnote)}</p>}
    </StudyDisclosure>;
    return <section className="study-kihon" aria-labelledby="study-kihon-title">
        <h2 id="study-kihon-title" className="app-view-heading">{translator.translate("Kihon – grunderna")}</h2>
        <p className="study-paragraph">{translator.translate(kihonIntroduction[0])}</p>
        <StudyDisclosure stateKey="kihon-introduction" title={translator.translate("Läs mer om Kihon")} headingLevel="none">
            <ul className="study-root-list">{kihonRoots.slice(0, 6).map(root => <li key={root.id}>
                <KihonName node={root} />{root.description && <> – {translator.translate(root.description)}</>}
            </li>)}</ul>
            {kihonIntroduction.slice(1).map(text => <p className="study-paragraph" key={text}>{translator.translate(text)}</p>)}
        </StudyDisclosure>
        <Form.Group className="study-area-selector" controlId="study-kihon-group">
            <Form.Label>{translator.translate("Välj område inom Kihon")}</Form.Label>
            <Form.Select value={selected.id} aria-describedby="study-kihon-name" onChange={event => {
                setSavedGroup(event.target.value);
                const next = new URLSearchParams(params);
                next.set("group", event.target.value); next.delete("node"); next.delete("section");
                setParams(next, { replace: true, preventScrollReset: true });
            }}>
                {kihonRoots.map((root, rootIndex) => <option key={root.id} value={root.id}>
                    {translator.translate(rootTitles[rootIndex])}
                </option>)}
            </Form.Select>
            <p id="study-kihon-name" className="study-secondary"><KihonName node={selected} /></p>
        </Form.Group>
        <section className="study-kihon-group" key={`${selected.id}:${target ?? ""}`} id={studyNodeId(selected.id)} aria-label={translator.translate(rootTitles[index])}>
            {selected.note && <p className="study-paragraph">{translator.translate(selected.note)}</p>}
            {selected.children?.every(node => node.kind === "technique")
                ? <KihonChildren nodes={selected.children} target={target} />
                : <>
                    {otherGroups.map((node, nodeIndex) => isTaiGamae && node.id === "fujinhō"
                        ? <section className="study-kihon-section" key={node.id} id={studyNodeId(node.id)} aria-labelledby="study-fujinho-heading">
                            <h3 id="study-fujinho-heading" className="app-section-heading">{translator.translate("Inbördes positioner")} · <KihonName node={node} /></h3>
                            <KihonAnnotations node={node} />
                            <KihonChildren nodes={node.children ?? []} target={target} />
                            {node.footnote && <p className="study-paragraph study-secondary">{translator.translate(node.footnote)}</p>}
                        </section>
                        : renderGroup(node, nodeIndex))}
                    {kamaeFamilies.length > 0 && <section className="study-kamae study-kihon-section" aria-labelledby="study-kamae-heading">
                        <h3 id="study-kamae-heading" className="app-section-heading">{translator.translate("Kroppsställningar")} · {noTranslate("Kamae")}</h3>
                        <div className="study-kamae-families">{kamaeFamilies.map((node, nodeIndex) => renderGroup(node, nodeIndex, 4))}</div>
                    </section>}
                </>}
            {selected.footnote && <p className="study-paragraph">{translator.translate(selected.footnote)}</p>}
        </section>
    </section>;
}

export default function StudyTopic() {
    const { topic: key } = useParams();
    const topic = studyTopicFor(key);
    const translator = useContext(TranslatorContext);
    const [params] = useSearchParams();
    const target = params.get("node");
    const section = params.get("section");
    useEffect(() => {
        if (!target && !section) return;
        const frame = requestAnimationFrame(() => {
            document.getElementById(target ? studyNodeId(target) : studySectionId(section!))?.scrollIntoView({ block: "start", behavior: "instant" });
        });
        return () => cancelAnimationFrame(frame);
    }, [key, target, section]);
    if (key === "common-movements" || key === "body-tools") {
        const next = new URLSearchParams(params);
        next.set("section", section ?? key);
        return <Navigate to={`${deepeningPath}/movements?${next}`} replace />;
    }
    if (!topic || topic.key === "groups") return <Navigate to={deepeningPath} replace />;
    const material = studyMaterial[topic.key];
    return <div className="study-topic">
        <header className="theory-page-header" id={studySectionId(topic.key)}>
            <h1 className="app-page-heading">{translator.translate(topic.title)}</h1>
            <p className="app-intro-copy">{translator.translate(topic.description)}</p>
        </header>
        {topic.key === "movements" && <KihonStudy />}
        <MaterialSections topic={topic.key} target={section} />
        <p className="study-source">{translator.translate("Källa: Yōgoshū (utkast), s. {0}.", { params: [material.pages] })}</p>
    </div>;
}
