# Staginggranskning: lugnare träningsupplevelse

Datum: 12 augusti 2026
Lokal feature-branch: `feat/calm-training-experience`
Lokal commit: `24b4ecd` (`feat: create calmer training experience`)
Utgångspunkt: `main` på commit `bb94870`

## Kort sammanfattning

Detta är en omfattande frontendförändring med målet att göra Shorinji Kempo-appen lugnare, luftigare, lättare att navigera och mer användbar under fysisk träning.

Arbetet omfattar bland annat:

- tydligare uppdelning mellan Träning och Teori
- Veckans träning och Fri träning
- träningsområden för Kihon, Hokei, Tan’en/Sōtai, Randori och Embu/Kumi-embu
- en separat, källbaserad Kihonlista som ska granskas med Sensei
- Embubyggare och klickbara tekniker i Kumi-embu
- lugnare teknikkort och självskattning
- Dojo-läge
- klarmarkering av träningsveckor
- global ordlistesökning med långtryck på mobil
- nya färger, typsnitt och layout
- tester för de nya flödena

Allt finns endast lokalt. Ingenting har pushats, ingen PR finns och varken staging eller produktion har ändrats.

Committen innehåller 50 filer med 5 806 tillagda rader och 416 borttagna rader.

## Git- och deploystatus

- Lokal branch: `feat/calm-training-experience`
- Lokal commit: `24b4ecd`
- Ingen lyckad `git push` har genomförts.
- Ingen remote-branch har skapats.
- Ingen pull request har skapats.
- Staging är orörd.
- Produktion är orörd.
- Vid kontrollen visade GitHub endast `main`; någon remote `deploy-staging`-branch syntes inte.
- Arbetet stoppades innan någon GitHub-inloggning eller extern ändring genomfördes.
- Stagingägaren måste beskriva rätt branch-/PR-/deployflöde innan någonting pushas.

`frontend/package-lock.json` har en lokal förändring som inte ingår i committen. `package.json` ändrades inte, och skillnaden ser ut att vara lokalt genererad npm-metadata.

Två processfiler ingår i committen och bör godkännas eller exkluderas före en PR:

- `.github/copilot-instructions.md`
- `TODO.md`

## 1. Navigation och appstruktur

Den befintliga adressen `/kamoku` finns kvar men visar nu en ingång till Träning.

När Träning öppnas visas endast två huvudval:

- Veckans träning
- Fri träning

Alla Hokei ligger inte längre som ett konkurrerande tredje val. Det finns i stället under:

`Träning -> Fri träning -> Hokei`

Undervyerna använder URL-parametrar:

- `/kamoku?view=plan`
- `/kamoku?view=free`
- `/kamoku?view=free&area=kihon`
- `/kamoku?view=free&area=hokei`
- `/kamoku?view=free&area=tanen-sotai`
- `/kamoku?view=free&area=randori`
- `/kamoku?view=free&area=embu`

Gamla vägar bevaras:

- `/list` omdirigeras till `/kamoku?view=free&area=hokei`.
- Det äldre läget `/kamoku?view=all` omvandlas till Fri träning/Hokei.

Under en pågående session på Träningssidan:

- Dojo-läget följer med när användaren växlar mellan veckoplan och fri träning.
- Besökta vyer ligger kvar monterade så att lokalt sidläge inte nollställs direkt.
- Fri tränings olika områden minns sin scrollposition.
- Det valda träningsområdet finns i URL:en.

Dojo-läget sparas däremot inte efter att användaren lämnat hela Träningssidan.

Viktiga filer:

- `frontend/src/Training.tsx`
- `frontend/src/Training.css`
- `frontend/src/routes.tsx`
- `frontend/src/practice-area.ts`

## 2. Startsida och toppfält

Startsidan har fått den mjukare frågan:

> Vad vill du göra idag?

Ovanför frågan finns nu en lugn kontextrad med `Gasshō` (`合掌` när japanska är huvudspråk). Raden upptar samma vertikala plats som undersidornas bakåtlänk, så startsidans huvudrubrik hamnar på samma höjd som rubrikerna på Träning och Teori. Ett frivilligt namn är inte implementerat; det ligger i TODO och ska senare sparas i det synkade användardokumentet så att hälsningen kan bli `Gasshō, {namn}`.

Träning och Teori är tydliga ingångar, men den slutliga idén om en startsida med enbart ”Studera eller Träna” är inte färdig. Graderingstest, teknikgrupper, inställningar och övriga befintliga sidor följer fortfarande sina tidigare synlighetsregler.

Det fasta toppfältet visar nu alltid:

> Shorinji Kempo

Det byter inte längre namn till aktuell sida. Sidans rubrik ger i stället sammanhanget. Det tar bort upprepningar som Träning i toppfält, bakåtlänk, rubrik och brödtext samtidigt.

Viktiga filer:

- `frontend/src/Start.tsx`
- `frontend/src/Grid.css`
- `frontend/src/App.tsx`
- `frontend/src/routes.tsx`

## 3. Teori som gemensam ingång

En ny Teori-sida samlar:

- Ordlista
- Quiz
- Flashkort

Dessa verktyg visas inte längre som separata toppval i huvudmenyn eller på startsidan. Varje underverktyg har en bakåtlänk till `/theory`.

När japanska är appens huvudspråk är Ordlista och Flashkort fortfarande dolda enligt den tidigare språklogiken. Quiz finns kvar.

Graderingstest ligger fortfarande på en separat sida. Att dela innehållet i en teoretisk del under Teori och en praktisk del under Träning finns i TODO.

Viktiga filer:

- `frontend/src/Theory.tsx`
- `frontend/src/Theory.css`
- `frontend/src/Theory.test.tsx`
- `frontend/src/routes.tsx`

## 4. Veckans träning

### Kontroller

Överst visas nu:

- gradval
- Dojo-läge
- Föregående vecka
- `Vecka X av Y`
- Nästa vecka

Grad och Dojo-läge ligger på samma kontrollrad. Veckonavigeringen ligger samlad under. Den extra avdelaren under kontrollerna är borttagen.

Graden visas en gång i sidans kontroll och upprepas inte på varje teknikkort i veckoplanen.

### Källbaserad introduktion

Varje vecka får en varm introduktion i löptext som byggs från veckans verkliga källdata.

Texten kan beskriva:

- grundarbete
- Hokei
- repetition
- Randorityp
- exakt Randoribegränsning
- studera/undervisa
- repetition och graderingsförberedelser

Texten hittar inte på innehåll. Den sammanfattar källfälten med regler i `frontend/src/weekly-copy.ts`.

Tester skapar introduktioner för varje källvecka i alla språk.

### Öppet veckofokus

Breda veckoinstruktioner visas öppet ovanför teknikkorten i stället för som kort som ser ut som enskilda tekniker.

Det gäller exempelvis:

- Kihon shōhō
- repetition
- studier
- Randori
- Embu
- förberedelser inför gradering

Enskilda tekniker ligger fortfarande i expanderbara Hokei-kort. Repetitions- och studera/undervisa-referenser kopplas tillbaka till befintliga teknikkort när det går, så detaljer, anteckningar, självskattning och videor bevaras.

### Markera veckan som tränad

En kombination av grad och vecka kan markeras som genomförd. En nyckel ser exempelvis ut som `6 kyū|1`.

En ISO-tidsstämpel sparas. Datum och tid visas diskret genom hover/fokus på dator. Klick eller tryck på `Tränad` öppnar en stabil liten ruta som ligger kvar och innehåller både tidpunkten och det tydliga valet `Ta bort klarmarkering`. Tryck utanför eller Escape stänger rutan. Den tidigare kombinationen av hover, fokus och klick på samma tooltip togs bort eftersom den kunde flimra på touchskärmar.

Endast en aktuell tidsstämpel sparas per grad/vecka. Historik över flera träningspass och en bredare återställningsfunktion är inte implementerade.

Viktiga filer:

- `frontend/src/Kamoku.tsx`
- `frontend/src/Kamoku.css`
- `frontend/src/Kamoku.test.tsx`
- `frontend/src/weekly-copy.ts`

## 5. Fri träning

Fri träning innehåller fem områden:

1. Kihon
2. Hokei
3. Tan’en och Sōtai
4. Randori
5. Embu och Kumi-embu

Från varje område går det att återvända till alla träningsområden med ett tryck. Områdets tillstånd och scrollposition bevaras under sessionen.

Viktiga filer:

- `frontend/src/FreePractice.tsx`
- `frontend/src/FreePractice.css`
- `frontend/src/FreePractice.test.tsx`

### 5.1 Kihonförslag

Ett träningsorienterat Kihonförslag har sammanställts i följande grupper:

- Kaisoku dachi / Byakuren chūdan gamae
  - angrepp
  - försvar
- Hidari/migi mae
- Uke och kontring
- Kōbōgi
- Idō kōbōgi

Användaren väljer ”Visa tekniker upp till grad”. Listan tar med tekniker vars första källgrad är lika med eller lägre än vald grad. Varje rad visar exempelvis `5 kyū`, inte `Från 5 kyū`.

Förslaget ligger avsiktligt separat från kanonisk JSON-data i `frontend/src/kihon-practice.ts`. Sidan är märkt för granskning med Sensei. Kamokuhyo- och graderingskällorna har inte skrivits om.

Båda dessa stavningar behålls separat i väntan på Senseis besked:

- `sashikae sokuō geri`
- `sashikae sokutō geri`

### 5.2 Tan’en och Sōtai

Befintlig data från `tanen_kihon_hokei.json` används utan ändring.

Materialet delas först i Tan’en och Sōtai och grupperas sedan i:

- Tenchi ken
- Giwa ken
- Ryūō ken
- Andra former

Befintliga videor följer med respektive form.

### 5.3 Randori

Randoridelen byggs dynamiskt från standardmoment i befintliga gradplaner.

Den:

- hittar alla Randorimoment
- sorterar efter grad och vecka
- tar bort identiska kombinationer av typ och begränsning
- visar första graden där temat förekommer
- visar Gōhō först
- visar Jūhō därefter
- placerar eventuella andra typer under Övrigt
- bevarar exakta begränsningar från källan

Om Kamokuhyo från en viss grad börjar ange Randori utan detaljerat delsteg visas det som en separat, källbaserad notering.

### 5.4 Bygg en egen Embu

Användaren har ett sparat utkast: ”min Embu”.

Funktionen innehåller:

- anteckningar för hela Embun
- sökning bland befintliga tekniker
- upp till åtta sökförslag
- sökning på källnamn, översatt namn, japanskt namn, teknikgrupp och variation
- tangentbordsstyrning med piltangenter, Enter och Escape
- lägga till, ta bort, flytta upp och flytta ner
- övergång eller kommentar mellan tekniker
- automatisk lagring
- klickbara tekniknamn
- öppning av det riktiga teknikkortet i fokusläge

Varje steg sparar:

- unikt id
- Hokei-namn
- grad
- vecka
- momentindex
- övergångstext

Hokei-namnet används som reserv om den exakta sparade referensen inte längre går att hitta.

### 5.5 Kumi-embu

Befintliga Kumi-embusekvenser läses från graderingsmaterialet och kan väljas per grad.

Tekniknamn kopplas till befintliga teknikkort. Sammansatta steg delas så att varje teknik kan klickas separat, medan avskiljaren ligger kvar som lugn text:

`Teknik A & Teknik B`

Matchningen hanterar bland annat:

- variationer i parentes
- `ren hankō`
- vissa skillnader mellan `tsuki` och `zuki`
- kombinationer separerade med `&` eller bindestreck

Befintliga kommentarer, instruktioner och videor finns kvar.

## 6. Teknikkort

### Normalt läge

Den lugnare kortrubriken kan visa:

- tekniknamn
- sekundär japansk text när den är aktiverad
- självskattning
- variationer
- teknikgrupp
- Kyohan-referens
- grad när omgivande vy behöver den

Kortets innehåll visar:

- Uppställning
- fotställningsbilder
- angripare
- försvarare
- Stans
- Utförande

Angriparens och försvararens information behåller den horisontella, Kamokuhyo-liknande strukturen. Saknad stans eller saknat utförande visas som `-` i stället för ett tomt fält.

### Fokus när kortet öppnas

När ett Hokei-kort öppnas:

- sidan bakom täcks av appens bakgrund
- toppfältet förblir synligt
- sidans scrollning låses
- flytande kontroller döljs
- kortet fixeras under toppfältet
- kortets rubrik är sticky
- Escape stänger kortet
- tidigare tangentbordsfokus återställs
- en gul/mässingsfärgad linje visas bara under tekniknamnet och får samma bredd som namnet

### Anteckningar

- Tom anteckningsdel heter `Anteckningar`.
- När en anteckning finns heter den `Mina anteckningar`.
- Sparade anteckningar öppnas direkt.
- Textfältet får fokus när anteckningsdelen öppnas.
- Befintlig lagring av anteckningar är bevarad.

### Video

- Den generiska texten `Video` är borttagen när ingen särskild etikett finns.
- Den separata filmikonen är borttagen.
- YouTube-ikonen och `YouTube` finns kvar.
- Modalvisning och extern YouTube-länk finns kvar.
- Ingen videodata har tagits bort.

### Självskattning

Tre visuellt dominanta stjärnor har ersatts med en lugn statuskontroll:

- Ej bedömd
- Behöver träna
- Övar
- Sitter

När kontrollen är stängd visas endast aktuell status och en liten färgad punkt. De lagrade värdena är fortfarande `null`, `1`, `2` eller `3`, så befintlig användardata bevaras.

Viktiga filer:

- `frontend/src/components/HokeiCard.tsx`
- `frontend/src/components/HokeiCard.css`
- `frontend/src/components/CollapsibleCard.tsx`
- `frontend/src/components/StarRating.tsx`
- `frontend/src/components/VideoLink.tsx`

## 7. Dojo-läge

Dojo-kortet tar bort sekundär studieinformation:

- självskattning
- grad
- teknikgrupp
- Kyohan-referens
- sekundär japanska/kanji när japanska inte är huvudspråk

Det behåller:

- tekniknamn
- variationer
- uppställningsbilder
- angriparens stans och utförande
- försvararens stans och utförande
- `ren hankō`
- anteckningar
- videor

När japanska är huvudspråk används japanskan som primär text. I ett icke-japanskt Dojo-läge används romaniserad/engelsk primär tekniktext utan en extra kanjirad.

En fullständig kontroll av alla korttyper i Dojo-läge återstår i TODO. Hokei-kort och japanska som huvudspråk har automatiska tester, men veckoteman, Kihon, Randori, Embu och Kumi-embu behöver fortfarande granskas på riktiga skärmar.

## 8. Global ordlistesökning

### Dator

När användaren markerar ett kort ord eller uttryck visas en diskret Sök-kontroll nära markeringen. Resultatet öppnas i en liten popup utan att användaren lämnar sidan.

Markeringar längre än 80 tecken eller åtta ord ignoreras.

### Långtryck på touchskärm

- Håll fingret på ett ord i 525 millisekunder.
- Om fingret flyttas mer än 10 pixlar avbryts gesten så att scrollning fungerar.
- Ordlistan öppnas direkt.
- Det efterföljande klicket på samma mål stoppas i upp till 1,2 sekunder.
- Ett ihopfällt kort förblir därför ihopfällt efter ett lyckat uppslag.

Långtryck används inte på:

- knappar
- länkar
- inputfält
- textområden
- selectkontroller
- redigerbart innehåll
- själva ordlistepopupen

Sökningen försöker först hitta det längsta matchande uttrycket runt ordet, upp till fem ord, och går annars tillbaka till det enskilda ordet.

Den kan hitta:

- exakt Romaji
- alias separerade med `/`
- kanji
- översatta betydelser
- delar av sammansatta uttryck

Högst fem träffar visas.

Om användaren markerar text i en expanderbar kortrubrik fälls kortet inte längre ut.

### Saknade ord

Ord som saknas loggas endast i webbläsarens `localStorage` med:

- ordet/uttrycket
- antal uppslag
- senaste uppslagstid

Högst 200 poster sparas. De visas i en ihopfällbar lista med saknade uppslag på Ordlista-sidan. De skickas inte till och synkas inte med backend.

Viktiga filer:

- `frontend/src/components/SelectionWordLookup.tsx`
- `frontend/src/components/SelectionWordLookup.css`
- `frontend/src/word-lookup.ts`
- `frontend/src/missing-word-lookups.ts`
- `frontend/src/WordList.tsx`

## 9. Färger, typsnitt och layout

### Ljust Washi-tema

- sidbakgrund: `#f2eee4`
- ljus kortyta: `#f8f4ec`
- brödtext: `#35342f`
- varm mässingsaccent: `#9a712d`

### Mörkt bläcktema

- sidbakgrund: `#0e1319`
- sekundär yta: `#151b22`
- kortyta: `#1b212a`
- brödtext: `#eeeae2`
- mässingsaccent: `#ddb84a`

Kort har dämpade kanter och varmare skuggor i ljust läge samt djupare skuggor och nästan svart omgivning i mörkt läge.

Rubriker, toppfält och tekniknamn använder denna serif-stack:

- Iowan Old Style
- Palatino Linotype
- Book Antiqua
- Yu Mincho/Hiragino Mincho för japanska
- Georgia som reserv

Brödtexten är fortfarande sans-serif.

Det mörka temat behöver fortfarande visuell finjustering. Översättningsfilen innehåller också några ofarliga men oanvända etiketter från ett tidigare färgexperiment: `Designprov`, `Bläck`, `Washi` och `Dimma`.

Viktiga filer:

- `frontend/src/styles/bootstrap-theme.scss`
- `frontend/src/index.css`
- de nya sid- och komponent-CSS-filerna

## 10. Sparad användardata och synkning

Två fält har lagts till i användardokumentet:

```text
embuDraft
weeklyPlanCompletions
```

### Embuutkast

Innehåller övergripande anteckning och en ordnad lista med steg. Vid konflikt används den befintliga strategin för ett sammanhängande värde: den nyare dokumentversionens hela Embuutkast vinner.

Det är enkelt och förutsägbart, men det slår inte ihop enskilda Embusteg om samma Embu redigerats samtidigt på två enheter. Detta bör godkännas uttryckligen.

### Genomförda veckor

Använder ett separat värde per grad och vecka och en trevägssammanslagning:

- olika veckor genomförda på olika enheter behålls båda
- om samma vecka genomförts på båda enheterna vinner den senaste tiden
- borttagning jämförs mot basdokumentet

### Äldre användardokument

Äldre dokument utan de nya fälten får säkra standardvärden:

```text
embuDraft = { notes: "", steps: [] }
weeklyPlanCompletions = {}
```

Ingen destruktiv migrering eller omskrivning av kanoniskt innehåll görs.

Viktiga filer:

- `frontend/src/persistence/schema.ts`
- `frontend/src/persistence/store.ts`
- `frontend/src/persistence/store.test.ts`
- `frontend/src/sync/merge.ts`
- `frontend/src/sync/merge.test.ts`

## 11. Innehåll och data som inte har ändrats

Följande kanoniska källor är orörda:

- gradplaner/Kamokuhyo
- Hokei- och teknikposter
- graderingskrav
- ordlistans originalposter
- Tan’en/Sōtai-data
- Kumi-embusekvenser i graderingskällan
- video-URL:er
- backend
- infrastruktur
- deploy-workflows

`frontend/src/assets/translations.json` har en stor diff eftersom nya UI-texter översatts till appens språk. Ursprungligt teknik- och graderingsinnehåll har inte skrivits om.

Innehåll har flyttats i presentationen, inte raderats:

- bred veckoinformation flyttades från kort till en öppen veckoöversikt
- Alla Hokei flyttades under Fri träning
- Ordlista, Quiz och Flashkort flyttades under Teori
- gradetiketter togs bort från veckans kort men finns kvar i sidans gradkontroll
- självskattningsvärden bevarades men visas inte längre som stjärnor

## 12. Test- och byggstatus

Senaste fullständiga frontendtest:

- 28 testfiler godkända
- 385 tester godkända
- inga testfel

Produktionsbygget är godkänt:

```text
npm run build
```

Det omfattar TypeScript, Vite-produktionsbygge och PWA/service worker.

Nya tester täcker bland annat:

- navigation mellan Träning och Teori
- kompatibilitet med gamla URL:er
- Dojo-läge mellan träningsvyer
- alla ingångar i Fri träning
- Kihonfiltrering per grad
- att Tan’en/Sōtai-gruppering inte tappar poster
- Randoriordning och första grad
- Embusökning, autosparande, sortering och öppning av teknikkort
- klickbara sammansatta Kumi-embutekniker
- veckans källinnehåll och introduktioner i alla språk
- veckans klarmarkering och tidsstämpel
- lugn självskattning
- japanska som primär text i Dojo-läge
- långtryck utan att öppna ett ihopfällt kort
- standardvärden för äldre användardokument
- sammanslagning av veckomarkeringar mellan enheter

Projektets fullständiga lintkommando är inte grönt. Det rapporterar 9 fel och 1 varning i befintliga områden som App, Flashcard, Quiz, hooks, MenuLayout, i18n, tester och CardUtilities. Flera är äldre React-hook-, typ- och refreshregler från `main`. De nya långtrycks- och ordlistefilerna klarar riktad lint.

Efter en lyckad testkörning kan det skrivas icke-blockerande `TimeoutNaNWarning`. Detta bör undersökas separat.

`frontend/vitest.config.ts` innehåller en Node 25-anpassning så att `happy-dom` tillhandahåller fungerande `localStorage` i testerna.

## 13. Rekommenderad kontroll i staging

1. Träning och Teori på dator och mobil.
2. Befintliga `/list`-bokmärken och `view=all`-länkar.
3. Befintliga anteckningar och självskattningar.
4. Veckomarkering och synkning på två enheter.
5. Ett äldre användardokument utan de två nya fälten.
6. Skapa en Embu, ladda om och fortsätt redigera.
7. Klickbara sammansatta tekniker i Kumi-embu.
8. Varje träningsområde med Dojo-läge aktiverat.
9. Japanska som appens huvudspråk.
10. Långtryck på riktig iPhone/iPad och Android:
    - ordlistan öppnas
    - ihopfällt kort förblir ihopfällt
    - scrollrörelse avbryter uppslaget
    - knappar och länkar fungerar normalt
11. Textzoom på smala skärmar.
12. Ljust och mörkt tema.

## 14. Frågor till stagingägaren

Före någon extern Git-åtgärd behöver följande bekräftas:

1. Vilket branch-/PR-/deployflöde ska användas för staging?
2. Ska en stagingbranch skapas, eller hanteras staging på annat sätt?
3. Ska denna stora commit ligga kvar samlad eller delas upp i logiska commits?
4. Är `embuDraft` och `weeklyPlanCompletions` godkända tillägg i det synkade användardokumentet?
5. Är strategin ”det nyare hela Embuutkastet vinner” acceptabel?
6. Är den lokala loggen över saknade ord acceptabel?
7. Ska `.github/copilot-instructions.md` och `TODO.md` följa med i PR:n?
8. Ska den lokala `package-lock.json`-förändringen kasseras eller regenereras i maintainer-miljön?
9. Är det okej att lägga det tydligt märkta Kihonförslaget i staging före Senseis granskning?
10. Ska oanvända översättningar eller befintliga lintfel städas före staging?

## 15. Kommandon för lokal granskning

Från repo-roten:

```powershell
git status --short --branch
git show --stat 24b4ecd
git diff main...24b4ecd
```

Från `frontend`:

```powershell
npm test
npm run build
npm run lint
```

Pusha ingenting förrän stagingägaren har bekräftat rätt arbetsflöde.
