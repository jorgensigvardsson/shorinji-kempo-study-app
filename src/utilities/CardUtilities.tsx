import { Badge as BootstrapBadge } from "react-bootstrap";
import { type Translator } from "../i18n";
import type { Variant } from "react-bootstrap/esm/types";
import type { ReactNode } from "react";

type RGB = `rgb(${number}, ${number}, ${number})`;
type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`;
type HEX = `#${string}`;

type Color = RGB | RGBA | HEX;

export interface HeadBadge {
    variant: Variant | Color;
    text: string;
    placement?: "top";
}

export interface HeadOptions {
    badges?: HeadBadge[];
    icons?: ReactNode[];
    emSize?: number;
}

interface BadgeProps {
    variant: Variant | undefined;
    color: Color | undefined;
    text: string;
    marginDirection: "e" | "s"
}

const Badge = (props: BadgeProps) => {
    const { variant, color, text, marginDirection } = props;

    return (
        <BootstrapBadge className={`m${marginDirection}-3`} bg={variant} 
               ref={el => {
                if (el && color) {
                    el.style.setProperty('background-color', color, 'important')
                }
               }}>
            {text}
        </BootstrapBadge>
    );
}

const isVariant = (v: Variant | Color): boolean => {
    switch(v) {
        case "danger":
        case "dark":
        case "info":
        case "light":
        case "primary":
        case "secondary": 
        case "success":
        case "warning":
            return true;
        default:
            return false;
    }
}

const getColor = (v: Variant | Color): Color | undefined => {
    return isVariant(v) ? undefined : v as Color;
}

const getVariant = (v: Variant | Color): Variant | undefined => {
    return isVariant(v) ? v as Variant : undefined;
}

export const cardHead = (translator: Translator, text: string, options: HeadOptions = {}) => {
    const translated = translator.translate(text, { capitalize: true });
    const translatedBadges = options.badges
        ? options.badges.filter(b => b.placement !== "top").map((b, index) => {
            return <Badge variant={getVariant(b.variant)} color={getColor(b.variant)} text={translator.translate(b.text)} key={index}
                          marginDirection="e"/>
        })
        : undefined;

    const translatedTopBadges = options.badges
        ? options.badges.filter(b => b.placement === "top").map((b, index) => {
            return <Badge variant={getVariant(b.variant)} color={getColor(b.variant)} text={translator.translate(b.text)} key={index}
                          marginDirection="s"/>
        })
        : undefined;

    if (translator.isJapanese) {
        return (
            <>
                <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between"}}>
                    <div style={{fontSize: `${options.emSize ?? 1.4}em`}}>{translated}&nbsp;&nbsp;{options.icons}</div>
                    <div style={{paddingRight: "0.5em"}}>{translatedTopBadges}</div>
                </div>
                <div>{translatedBadges}</div>
            </>
        );
    }

    const japaneseNative = translator.japanese(text);

    return (
        <>
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                <div style={{fontSize: `${options.emSize ?? 1.4}em`}}>{translated}&nbsp;&nbsp;{options.icons}</div>
                <div style={{paddingRight: "0.5em"}}>{translatedTopBadges}</div>
            </div>
            <div style={{ fontSize: `${(options.emSize ?? 1.4) * 0.75}em` }} className="text-muted">
                {japaneseNative}
            </div>
            <div>{translatedBadges}</div>
        </>
    );
}