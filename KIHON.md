# Kihon data

`frontend/src/assets/kihon.json` holds the kihon (基本, fundamentals) of Shorinji Kempo as
a tree: the stances, footwork, body movements, attacks and defences that every technique
is built from. 271 nodes, 218 of them techniques. Nothing in the app reads it yet. It is
there to be built on.

The source is the kihon chapter of the Swedish yōgoshū (terminology booklet), pages 16–25
as printed: `docs/yogoshu-utkast.pdf`, a sibling of this repository rather than part of it.
The PDF is a draft (*utkast*), so expect corrections. Make them in `kihon.json` itself,
which is now the source of truth; nothing regenerates it.

## Shape

The file is an array of `KihonNode` (declared in `frontend/src/data.ts`):

```ts
interface KihonNode {
  id: string;            // identity: see "Ids" below
  kind: KihonKind;       // what the node is
  name: string;          // romaji, as printed: "jōdan choku zuki"
  kanji: string;         // "上段直突"
  description?: string;  // Swedish gloss: "choku zuki i huvudsak mot huvudet …"
  note?: string;         // the small print under a heading row
  footnote?: string;     // a "notera:" closing the section
  alsoKnownAs?: { name: string; kanji: string };  // byakuren chūdan gamae = kaisoku chūdan gamae
  children?: KihonNode[];
}
```

Only `technique` nodes are leaves. Every other kind has `children`.

There is no number field. Techniques are numbered as printed, the numbering restarts in
every section, and the printed number is always the position in `children` + 1. The one
section printed without numbers is fujinhō, whose three pair positions are not a sequence;
show numbers there or not as the page sees fit.

### Kinds

A kind says what a node is, not how deep it sits. Depth varies by group: tai gamae is
group → subgroup → technique, while kōgi goes seven levels deep.

| Kind | What it is | Examples |
| --- | --- | --- |
| `group` | one of the kihon groups (the top level) | tai gamae, sokuihō, umpohō, taisabaki, kōgi, bōgi, shuhō |
| `category` | kōgi split by what attacks | te no waza, ashi no waza, karada no waza |
| `subgroup` | a set of one type | tsuki te, kiri te, hiki ashi, fujinhō |
| `methods` | 方, *ways of delivering*: which hand or foot, after which step, how many | tsuki kata (jun zuki, ren zuki …), keri kata (sashikomi geri, nidan geri …) |
| `techniques` | 技, the strikes and kicks themselves | tsuki waza, keri waza |
| `trajectory` | the line of the attack | chokusen (straight), kyokusen (curved) |
| `family` | a technique whose variants are listed under it | choku zuki → jōdan/chūdan/gedan choku zuki |
| `technique` | a leaf | gasshō gamae, mae ukemi, mawashi geri |

`methods` and `techniques` are siblings under tsuki te and keri ashi, and they answer
different questions. Jun zuki is not a different strike from choku zuki; it says which
hand delivers one.

### Outline

Leaf counts in brackets.

```
tai gamae 体構え (20)        fujinhō · byakuren hachi jin · giwa kyū jin
sokuihō 足位法 (16)          ichi · tachi kata
umpohō 運歩法 (26)           de ashi · hiki ashi · yoko ashi · tenkai ashi
taisabaki 体捌き (32)        taishin · irimi · kaishin · furimi · kusshin · tenshin · kaiten shin
kōgi 攻技 (88)
  te no waza 手の技
    tsuki te 突手            methods tsuki kata · techniques tsuki waza
                               └ chokusen: choku zuki, kagi zuki · kyokusen: furi zuki, henka zuki
    uchi te 打手             families akken uchi, kaishu uchi, wantō uchi
    kiri te 切手 · hiji ate 肘当
  ashi no waza 足の技
    keri ashi 蹴足           methods keri kata · techniques keri waza (chokusen · kyokusen)
    kari ashi 刈足 · fumi ashi 踏足 · hiza ate 膝当
  karada no waza 体の技      zu tsuki 頭突 · tai atari 体当
bōgi 防技 (29)               te ashi ni yoru bōgi · taisabaki ni yoru bōgi
shuhō 守法 (7)
```

## Ids

`id` is identity. Things elsewhere in the app link to it, and anything saved against a
technique is stored under it. The rules in AGENTS.md ("Ids in the source data") apply: an
id is never renamed or reused, `kihon-id-baseline.json` records every id handed out, and
`kihon.test.ts` fails if one disappears or changes meaning.

An id is the node's `name`, except where a name is shared. Eleven are: six headings share
a name with their own first technique (hiki ashi, yoko ashi, kaishin, kusshin, zu tsuki,
tai atari), chokusen and kyokusen appear under both tsuki waza and keri waza, and tai
gamae is two words (体構え the group, 対構 the pair stance). The technique keeps the bare
name; every other holder carries its parent's name in brackets:

```
"hiki ashi"              the technique: dra ett ben bakåt
"hiki ashi [umpohō]"     the subgroup above it: steg bakåt
"chokusen [tsuki waza]"  "chokusen [keri waza]"
"tai gamae"              the pair stance 対構
"tai gamae [kihon]"      the group 体構え
```

So to link a hokei technique to its kihon, the bare name is the id you want. Ids that
contain `[` are headings.

## Displaying it

- **Names** are Japanese terms. Show `name` as it is, and `kanji` beside it or instead of
  it for Japanese readers. Do not pass names to `translator.translate()`: the kanji is
  already in the data, and AGENTS.md would then require entries in all three language
  files.
- **`description`, `note` and `footnote`** are Swedish, and every one of them has entries
  in `translations.ja.json`, `translations.en.json` and `translations.tr.json`. Pass them to
  `translator.translate()`. Most of them are also word-list meanings, which is how they
  came to be translated; the rest were added alongside.
- **Kanji spelling** follows the app wherever the app already had the word (中段構, not
  the PDF's 中段構え) and the PDF elsewhere (卍構え). The mix is deliberate, so do not
  "normalise" one into the other without asking.
- **Fonts**: nothing special. Japanese falls through the font stack on its own; see the
  font section of AGENTS.md.

## Relation to the word list

Every name in `kihon.json` is also an entry in `word-list.json`. Words added from the
yōgoshū carry the kihon description as their meaning; the 35 that were in the word list
before kept their own wording. The word list is flat and alphabetical. `kihon.json` is the same vocabulary
with its structure: what belongs to what, in which order, and which variants make up a
family. Use the word list to look a term up; use `kihon.json` to show where it belongs.

A few older word-list entries disagree with the PDF and have deliberately not been changed
yet: #412 seitai gamae (spelled 正体構え, glossed as an upright stance; the PDF has 正対構え,
a pair position), #411 hiraki gamae and #410 ichiji gamae (glosses differ from the PDF's).
`kihon.json` follows the PDF's meaning.

## Ideas it can carry

- A kihon browser: the tree as collapsible sections, each technique with kanji and gloss.
- Flashcards per group or subgroup (all of umpohō; the eight byakuren positions), on the
  same pattern as the existing footwork flashcards.
- Links from hokei and kamokuhyō techniques to the kihon they use.
- Quiz questions that test structure rather than vocabulary: which trajectory, which
  family, which group.
