import { useContext } from "react";
import { noTranslate, TranslatorContext } from "./i18n";

// Transcribed from the tables on printed p. 4 of Yōgoshū (utkast).
// Kana and their romanization are intentionally fixed-language content.
const rows = (text: string) => noTranslate(text).split(";").map(row => row.trim().split(/\s+/));
const kanaTables = [
    { title: "Grundtecken", rows: rows("あ a ア;い i イ;う u ウ;え e エ;お o オ;か ka カ;き ki キ;く ku ク;け ke ケ;こ ko コ;さ sa サ;し shi シ;す su ス;せ se セ;そ so ソ;た ta タ;ち chi チ;つ tsu ツ;て te テ;と to ト;な na ナ;に ni ニ;ぬ nu ヌ;ね ne ネ;の no ノ;は ha ハ;ひ hi ヒ;ふ fu フ;へ he ヘ;ほ ho ホ;ま ma マ;み mi ミ;む mu ム;め me メ;も mo モ;や ya ヤ;ゆ yu ユ;よ yo ヨ;ら ra ラ;り ri リ;る ru ル;れ re レ;ろ ro ロ;わ wa ワ;ゐ wi ヰ;ゑ we ヱ;を wo ヲ;ん n ン") },
    { title: "Tecken med omljud", rows: rows("が ga ガ;ぎ gi ギ;ぐ gu グ;げ ge ゲ;ご go ゴ;ざ za ザ;じ ji ジ;ず zu ズ;ぜ ze ゼ;ぞ zo ゾ;だ da ダ;ぢ ji ヂ;づ zu ヅ;で de デ;ど do ド;ば ba バ;び bi ビ;ぶ bu ブ;べ be ベ;ぼ bo ボ;ぱ pa パ;ぴ pi ピ;ぷ pu プ;ぺ pe ペ;ぽ po ポ") },
    { title: "Sammansatta ljud", rows: rows("きゃ kya キャ;きゅ kyu キュ;きょ kyo キョ;しゃ sha シャ;しゅ shu シュ;しょ sho ショ;ちゃ cha チャ;ちゅ chu チュ;ちょ cho チョ;にゃ nya ニャ;にゅ nyu ニュ;にょ nyo ニョ;ひゃ hya ヒャ;ひゅ hyu ヒュ;ひょ hyo ヒョ;みゃ mya ミャ;みゅ myu ミュ;みょ myo ミョ;りゃ rya リャ;りゅ ryu リュ;りょ ryo リョ;ぎゃ gya ギャ;ぎゅ gyu ギュ;ぎょ gyo ギョ;じゃ ja ジャ;じゅ ju ジュ;じょ jo ジョ;びゃ bya ビャ;びゅ byu ビュ;びょ byo ビョ;ぴゃ pya ピャ;ぴゅ pyu ピュ;ぴょ pyo ピョ") },
];

export default function JapaneseReading() {
    const translator = useContext(TranslatorContext);
    return <>
        <p className="study-paragraph">{translator.translate("Hiragana står till vänster, romaji i mitten och katakana till höger. Tecknen ゐ/ヰ och ゑ/ヱ används inte längre i modern japanska.")}</p>
        <div className="study-kana-tables">{kanaTables.map(table => <section key={table.title}>
            <h4 className="study-subsection-heading">{translator.translate(table.title)}</h4>
            <table className="table study-kana-table">
                <thead><tr><th scope="col">{translator.translate("Hiragana")}</th><th scope="col">{translator.translate("Romaji")}</th><th scope="col">{translator.translate("Katakana")}</th></tr></thead>
                <tbody>{table.rows.map(([hiragana, romaji, katakana]) => <tr key={hiragana}>
                    <td>{noTranslate(hiragana)}</td><td>{noTranslate(romaji)}</td><td>{noTranslate(katakana)}</td>
                </tr>)}</tbody>
            </table>
        </section>)}</div>
    </>;
}
