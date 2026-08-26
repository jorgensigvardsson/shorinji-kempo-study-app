import type { ChangelogEntry } from './changelog';

// The release notes themselves, kept apart from changelog.ts so that the app can
// decide whether there is anything unseen without carrying every entry ever written
// in its startup bundle. Newest first.
export const CHANGELOG: ChangelogEntry[] = [
  {
    timestamp: "2026-08-26T04:28:56.000Z",
    changes: [
      {
        emoji: "🏛️",
        sv: "Appen känner nu till organisationen: WSKO, nationella förbund och klubbar. Varje medlem hör till en klubb, och under Min klubb ser du vilken.",
        en: "The app now knows the organization: WSKO, national federations and branches. Every member belongs to a branch, and My branch shows you which.",
        tr: "Uygulama artık organizasyonu tanıyor: WSKO, ulusal federasyonlar ve kulüpler. Her üye bir kulübe bağlıdır ve Kulübüm sayfasında hangisi olduğunu görebilirsiniz.",
        ja: "アプリが組織の構造を扱えるようになりました。WSKO、各国連盟、支部の三層です。会員はいずれかの支部に所属し、「所属支部」のページで確認できます。",
      },
      {
        emoji: "✋",
        sv: "Nya konton godkänns av den klubb man ansöker till. Du anger din e-postadress, väljer klubb och skriver några rader om dig själv — klubbens administratörer svarar via e-post.",
        en: "New accounts are approved by the branch you apply to. You give your email address, pick a branch and write a few lines about yourself — the branch's administrators answer by email.",
        tr: "Yeni hesaplar, başvurduğunuz kulüp tarafından onaylanır. E-posta adresinizi verir, bir kulüp seçer ve kendinizden kısaca bahsedersiniz — kulüp yöneticileri e-posta ile yanıtlar.",
        ja: "新しいアカウントは、申請した支部が承認します。メールアドレスを入力し、支部を選び、自己紹介を少し書いていただくと、支部の管理者からメールで返事が届きます。",
      },
      {
        emoji: "📦",
        sv: "Har du flyttat? Under Min klubb kan du ansöka om att byta till en annan klubb. Den klubb du vill träna i avgör, och den du lämnar får besked.",
        en: "Moved to another town? My branch lets you ask to transfer to another branch. The branch you want to train in decides, and the one you leave is told.",
        tr: "Başka bir şehre mi taşındınız? Kulübüm sayfasından başka bir kulübe geçmek için başvurabilirsiniz. Kararı geçmek istediğiniz kulüp verir, ayrıldığınız kulübe de bilgi verilir.",
        ja: "引っ越しをされた方は、「所属支部」から他の支部への移籍を申請できます。受け入れ側の支部が判断し、離れる支部にも通知されます。",
      },
      {
        emoji: "🔒",
        sv: "Integritetspolicyn säger nu rakt ut att ingen administratör — varken klubbens, förbundets eller organisationens — kan läsa dina anteckningar eller dina självvärderingar. De sköter medlemskap, inte studier.",
        en: "The privacy policy now says plainly that no administrator — of your branch, your federation or the organization — can read your notes or your self-assessments. They run memberships, not studies.",
        tr: "Gizlilik politikası artık açıkça belirtiyor: hiçbir yönetici — ne kulübünüzün, ne federasyonunuzun, ne de organizasyonun yöneticisi — notlarınızı ya da öz değerlendirmelerinizi okuyamaz. Onlar üyeliği yürütür, çalışmayı değil.",
        ja: "プライバシーポリシーに、支部・連盟・組織のいずれの管理者もあなたのメモや自己評価を読むことはできない、と明記しました。管理者が扱うのは会員管理であって、修練の中身ではありません。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T15:18:52.722Z",
    changes: [
      {
        emoji: "🙏",
        sv: "Hälsningen på startsidan avslutas nu med 🙏, så som kenshi hälsar varandra.",
        en: "The greeting on the start page now ends with 🙏, the way kenshi greet each other.",
        tr: "Başlangıç sayfasındaki selamlama artık 🙏 ile bitiyor; kenshiler birbirini böyle selamlar.",
        ja: "スタートページの挨拶の最後に🙏を添えました。拳士同士が挨拶を交わすときの合掌です。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T14:25:49.000Z",
    changes: [
      {
        emoji: "📝",
        sv: "Anteckningar och självskattningar hör nu till en enskild teknik. Elva tekniker delar namn med en eller två andra – till exempel tsuki nuki soto, uchi och ryōte – och de delade tidigare på samma anteckning och samma stjärnbetyg. Nu har varje variation sin egen.",
        en: "Notes and self-assessments now belong to one technique. Eleven techniques share a name with one or two others – tsuki nuki soto, uchi and ryōte, for instance – and used to share a single note and a single star rating between them. Each variation now has its own.",
        tr: "Notlar ve öz değerlendirmeler artık tek bir tekniğe ait. On bir teknik adını bir ya da iki teknikle paylaşıyor – örneğin tsuki nuki soto, uchi ve ryōte – ve daha önce aynı notu ve aynı yıldız puanını paylaşıyorlardı. Artık her varyasyonun kendine ait olanı var.",
        ja: "メモと自己評価が、それぞれの技に対して個別に保存されるようになりました。11の技は他の1つか2つと名前が重なっており（例えば突抜の外・内・両手）、これまでは同じメモと同じ星評価を共有していました。今後は変化ごとに別々に保存されます。",
      },
      {
        emoji: "🌓",
        sv: "Temat följer nu enheten i stället för kontot. Du kan ha mörkt tema i dojon på telefonen och ljust på datorn utan att de skriver över varandra – och appen frågar inte längre vilket av dem som gäller.",
        en: "The theme now follows the device rather than the account. You can have dark in the dojo on your phone and light on your computer without one overwriting the other – and the app no longer asks which of them applies.",
        tr: "Tema artık hesabı değil cihazı takip ediyor. Telefonunuzda dojoda koyu, bilgisayarınızda açık tema kullanabilirsiniz; biri diğerinin üzerine yazmıyor ve uygulama artık hangisinin geçerli olduğunu sormuyor.",
        ja: "テーマがアカウントではなく端末ごとの設定になりました。道場ではスマートフォンをダークに、自宅のパソコンはライトに、と別々に設定でき、互いに上書きされることはありません。どちらを使うか尋ねられることもなくなりました。",
      },
      {
        emoji: "🔀",
        sv: "Om du redigerat samma anteckning på två enheter behåller appen den senaste ändringen i stället för att fråga dig vilken som gäller. Anteckningar skrivna innan den här ändringen saknar tidpunkt, och för dem frågar appen fortfarande.",
        en: "If you have edited the same note on two devices, the app now keeps the most recent version instead of asking you which one applies. Notes written before this change carry no timestamp, and for those it still asks.",
        tr: "Aynı notu iki cihazda düzenlediyseniz, uygulama artık hangisinin geçerli olduğunu sormak yerine en son sürümü saklıyor. Bu değişiklikten önce yazılan notlarda zaman damgası yok; onlar için hâlâ soruyor.",
        ja: "同じメモを2台の端末で編集した場合、どちらを残すか尋ねる代わりに、最後に書かれた内容を保持するようになりました。この変更より前に書かれたメモには時刻が記録されていないため、その場合は引き続き確認を求めます。",
      },
      {
        emoji: "✂️",
        sv: "En anteckning kan nu vara högst 2000 tecken. Räknaren visas när du närmar dig gränsen. Det är gott om plats för en teknik, och det håller dina anteckningar innanför den storlek som går att synka.",
        en: "A note can now be at most 2000 characters. The counter appears as you approach the limit. That is ample for a single technique, and it keeps your notes within the size that can be synced.",
        tr: "Bir not artık en fazla 2000 karakter olabilir. Sayaç, sınıra yaklaştığınızda görünür. Tek bir teknik için fazlasıyla yeterli ve notlarınızı senkronize edilebilir boyutun içinde tutuyor.",
        ja: "1つのメモは最大2000文字までになりました。上限に近づくと文字数が表示されます。1つの技について書くには十分な長さで、同期できる容量の範囲にメモを収めるためのものです。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T12:36:39.356Z",
    changes: [
      {
        emoji: "🥋",
        sv: "Träningsläget heter nu Dojo-läge. När det är påslaget skalas grader och annan kringinformation bort samtidigt som det du faktiskt tränar blir större, så innehållet går lättare att läsa med mobilen på golvet.",
        en: "Training mode is now called Dojo mode. When enabled, grades and other supporting information are removed while the content you are practising becomes larger, making it easier to read with the phone on the floor.",
        tr: "Antrenman modunun adı artık Dojo modu. Açıldığında dereceler ve diğer ikincil bilgiler gizlenirken çalıştığınız içerik büyütülüyor; böylece telefon yerdeyken okumak kolaylaşıyor.",
        ja: "トレーニングモードの名称を「道場モード」に変更しました。有効にすると、級位などの補足情報を省き、実際に練習する内容を大きく表示するため、床に置いたスマートフォンからも読みやすくなります。",
      },
      {
        emoji: "🧩",
        sv: "Embu-byggaren är nu en kompakt planeringstavla med sex fasta sekvenser. Tryck på ett tekniknamn när du vill se attacken eller skriva kommentarer, och dra tekniker med sexpunktsreglaget för att flytta dem inom eller mellan sekvenser.",
        en: "The Embu builder is now a compact planning board with six fixed sequences. Tap a technique name when you want to see the attack or write comments, and drag techniques by the six-dot handle to move them within or between sequences.",
        tr: "Embu oluşturucu artık altı sabit diziden oluşan kompakt bir planlama panosu. Saldırıyı görmek veya yorum yazmak istediğinizde teknik adına dokunabilir, teknikleri altı noktalı tutamaktan sürükleyerek aynı dizi içinde ya da diziler arasında taşıyabilirsiniz.",
        ja: "演武作成が、6つの固定された構成を並べたコンパクトな計画画面になりました。攻撃の確認やコメントの記入は技名を押して開き、6点のハンドルで技をドラッグして構成内や構成間を移動できます。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T11:18:51.771Z",
    changes: [
      {
        emoji: "🥋",
        sv: "Gyaku tenshin geri visar nu rätt utgångsställning: hiraki gamae.",
        en: "Gyaku tenshin geri now shows the correct starting stance: hiraki gamae.",
        tr: "Gyaku tenshin geri artık doğru başlangıç duruşunu gösteriyor: hiraki gamae.",
        ja: "Gyaku tenshin geri の開始構えを、正しい hiraki gamae に修正しました。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T11:10:15.322Z",
    changes: [
      {
        emoji: "↕️",
        sv: "Teknikkort öppnas nu direkt på sin plats i listan i stället för att ta över skärmen. Innehållet anpassas efter kortets egen bredd, så små förändringar av fönstret ger ett stabilare upplägg.",
        en: "Technique cards now open directly in place in the list instead of taking over the screen. Their content adapts to the card's own width, making the layout more stable when the window changes slightly.",
        tr: "Teknik kartları artık ekranı kaplamak yerine listedeki yerinde açılıyor. İçerik kartın kendi genişliğine göre uyarlanıyor; böylece pencere boyutundaki küçük değişikliklerde düzen daha kararlı kalıyor.",
        ja: "技法カードが画面全体を覆わず、一覧のその場で開くようになりました。内容はカード自体の幅に合わせて調整されるため、画面幅が少し変わってもレイアウトが安定します。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T10:48:45.998Z",
    changes: [
      {
        emoji: "✏️",
        sv: "Anteckningar på hokei-kort visas nu kompakt bredvid videolänken och öppnas för redigering först när du trycker på pennan. Radbrytningar bevaras, och de flytande inställningarna döljs när ett kort är öppet så att inget hamnar i vägen.",
        en: "Notes on hokei cards are now shown compactly beside the video link and open for editing only when you tap the pencil. Line breaks are preserved, and the floating settings are hidden while a card is open so nothing gets in the way.",
        tr: "Hokei kartlarındaki notlar artık video bağlantısının yanında kompakt biçimde gösteriliyor ve yalnızca kaleme dokunduğunuzda düzenlemeye açılıyor. Satır sonları korunuyor ve bir kart açıkken hiçbir şeyin önünü kapatmaması için yüzen ayarlar gizleniyor.",
        ja: "法形カードのメモを動画リンクの横にコンパクトに表示し、鉛筆を押したときだけ編集欄が開くようにしました。改行はそのまま保たれ、カードを開いている間は内容を隠さないようフローティング設定を非表示にします。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T10:12:00.000Z",
    changes: [
      {
        emoji: "✍️",
        sv: "En felstavning i graderingsmaterialet är rättad: `sashikae sokuō geri` heter `sashikae sokutō geri`. Det var samma spark hela tiden, så under Kihon står den nu på en enda rad, från 4 kyū.",
        en: "A misspelling in the grading material has been corrected: `sashikae sokuō geri` is called `sashikae sokutō geri`. It was the same kick all along, so under Kihon it now appears on a single line, from 4 kyū.",
        tr: "Derece sınavı materyalindeki bir yazım hatası düzeltildi: `sashikae sokuō geri` aslında `sashikae sokutō geri`. Baştan beri aynı tekmeydi; bu yüzden Kihon bölümünde artık tek bir satırda, 4 kyū'dan itibaren görünüyor.",
        ja: "昇級試験科目の表記の誤りを修正しました。`sashikae sokuō geri` は `sashikae sokutō geri` です。もともと同じ蹴りだったため、基本のページでは4級からの一項目としてまとめて表示されます。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T08:57:35.671Z",
    changes: [
      {
        emoji: "🥋",
        sv: "Embu och kumi-embu har fått varsitt tydligt val under Fri träning. Embu-byggaren leder dig genom sex sekvenser, låter varje sekvens innehålla flera hokei och ger varje teknik en egen kompakt kommentar. Kumi-embu visas nu med samma lugna upplägg under både träning och gradering.",
        en: "Embu and kumi-embu now have separate, clear entrances under Free practice. The embu builder guides you through six sequences, allows several hokei in each sequence, and gives every technique its own compact comment. Kumi-embu now uses the same calm layout in both practice and grading.",
        tr: "Embu ve kumi-embu artık Serbest çalışma altında ayrı ve anlaşılır seçeneklere sahip. Embu oluşturucu sizi altı dizi boyunca yönlendiriyor, her dizide birden fazla hokei kullanılmasına izin veriyor ve her tekniğe kendi kompakt yorumunu ekleme olanağı sunuyor. Kumi-embu artık hem çalışma hem de sınav bölümünde aynı sade düzenle gösteriliyor.",
        ja: "自由練習で、演武と組演武をそれぞれ分かりやすく選べるようになりました。演武作成では6つの構成を順に組み立て、各構成に複数の法形を入れ、技ごとにコンパクトなコメントを残せます。組演武は練習と昇格考試の両方で、同じ落ち着いた表示になりました。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T07:39:46.494Z",
    changes: [
      {
        emoji: "🧭",
        sv: "Nya sidor öppnas nu högst upp. När du går tillbaka eller framåt kommer du tillbaka till samma plats på sidan som tidigare.",
        en: "New pages now open at the top. When you go back or forward, you return to the same place on the page as before.",
        tr: "Yeni sayfalar artık en üstten açılıyor. Geri veya ileri gittiğinizde sayfada daha önce bulunduğunuz yere dönüyorsunuz.",
        ja: "新しいページは一番上から表示されるようになりました。戻る・進む操作では、そのページで以前見ていた位置に戻ります。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T07:22:55.237Z",
    changes: [
      {
        emoji: "👋",
        sv: "Startsidan hälsar dig nu välkommen med ditt namn efter Gasshō, när det finns ett namn på kontot.",
        en: "The start page now welcomes you by name after Gasshō when your account has a name.",
        tr: "Hesabınızda bir ad varsa başlangıç sayfası artık Gasshō'nun ardından adınızla sizi karşılıyor.",
        ja: "アカウントに名前が登録されている場合、スタートページで「合掌」に続けて名前を表示するようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T06:40:41.382Z",
    changes: [
      {
        emoji: "🪶",
        sv: "Appens rubriker har fått en gemensam och lugnare hierarki. I veckoplanen har den överflödiga rubriken ”Veckans innehåll” lämnat plats åt små färgade rubriker för varje del, så planen blir lättare att överblicka.",
        en: "Headings now share a calmer, more consistent hierarchy. In the weekly plan, the redundant “This week's content” heading has made room for small colored headings for each part, making the plan easier to scan.",
        tr: "Uygulamadaki başlıklar artık daha sakin ve tutarlı bir düzene sahip. Haftalık planda gereksiz “Bu haftanın içeriği” başlığı kaldırılarak her bölüm için küçük renkli başlıklara yer açıldı; böylece planı gözden geçirmek kolaylaştı.",
        ja: "アプリ全体の見出しを、より落ち着いた一貫性のある階層に整えました。週間計画では、重複していた「今週の内容」という見出しを表示せず、各項目を小さな色付き見出しで示すことで、内容を確認しやすくしました。",
      },
    ],
  },
  {
    timestamp: "2026-08-16T06:21:49.000Z",
    changes: [
      {
        emoji: "🎬",
        sv: "Videolänkarna är lugnare. Ramen runt länken är borta överallt i appen, och under Tan'en och sōtai upprepas inte längre formens namn inuti länken – det står redan på raden ovanför.",
        en: "Video links are calmer. The frame around the link is gone everywhere in the app, and under Tan'en and sōtai the form's name is no longer repeated inside the link – it is already on the line above.",
        tr: "Video bağlantıları daha sade. Bağlantının çevresindeki çerçeve uygulamanın her yerinde kaldırıldı ve Tan'en ve sōtai bölümünde formun adı artık bağlantının içinde tekrarlanmıyor – zaten hemen üstteki satırda yazıyor.",
        ja: "動画リンクの見た目を整えました。リンクを囲む枠をアプリ全体でなくし、単演・相対では法形の名前をリンク内で繰り返さないようにしました。名前はすぐ上の行に表示されています。",
      },
    ],
  },
  {
    timestamp: "2026-08-14T19:29:01.000Z",
    changes: [
      {
        emoji: "🔥",
        sv: "Din pågående svit i quizet ligger kvar. Laddar du om appen, eller lämnar quizet för en annan sida och kommer tillbaka, fortsätter räkningen där du lämnade den. Sviten sparas bara på den här enheten, och börjar om från noll om du byter grad.",
        en: "Your quiz streak now stays put. Reload the app, or leave the quiz for another page and come back, and the count carries on where you left it. The streak is kept on this device only, and starts over from zero if you change grade.",
        tr: "Quizde devam eden seriniz artık korunuyor. Uygulamayı yeniden yüklediğinizde ya da quizden başka bir sayfaya gidip geri döndüğünüzde sayım kaldığı yerden devam ediyor. Seri yalnızca bu cihazda saklanıyor ve derecenizi değiştirirseniz sıfırdan başlıyor.",
        ja: "クイズの連続正解数がそのまま残るようになりました。アプリを再読み込みしても、クイズを離れて別のページから戻っても、続きから数え続けます。連続正解数はこの端末にのみ保存され、段級を変更すると0からやり直しになります。",
      },
    ],
  },
  {
    timestamp: "2026-08-14T16:52:00.000Z",
    changes: [
      {
        emoji: "🔢",
        sv: "Ett fel har åtgärdats där kenshinumret såg ut att sparas men var borta nästa gång appen öppnades. Numret kan nu skrivas precis som det står på kortet, med bindestreck eller mellanrum, och visas grupperat som 123-456789 eller 1234-567890. Både de äldre numren med tre inledande siffror och hombus nya med fyra fungerar, och skrivs något som inte är ett kenshinummer in säger appen ifrån.",
        en: "Fixed a bug where the kenshi number looked saved but was gone the next time the app was opened. The number can now be written exactly as it appears on your card, with a hyphen or spaces, and is shown grouped as 123-456789 or 1234-567890. Both the older numbers with three leading digits and hombu's new ones with four are accepted, and the app says so if what is entered is not a kenshi number.",
        tr: "Kenshi numarasının kaydedilmiş gibi görünüp uygulama bir sonraki açılışta kaybolmasına yol açan bir hata düzeltildi. Numara artık kartınızda yazdığı gibi, tire veya boşluklarla girilebiliyor ve 123-456789 ya da 1234-567890 biçiminde gruplanmış olarak gösteriliyor. Hem baştaki üç rakamlı eski numaralar hem de hombunun dört rakamlı yeni numaraları kabul ediliyor; girilen bir kenshi numarası değilse uygulama bunu bildiriyor.",
        ja: "拳士番号が保存されたように見えても、次にアプリを開くと消えていた不具合を修正しました。番号はカードに書かれているとおり、ハイフンや空白を入れて入力でき、123-456789 または 1234-567890 の形に区切って表示されます。先頭が3桁の従来の番号も、本部が新たに発行する4桁の番号も使用でき、拳士番号でないものが入力された場合はその旨をお知らせします。",
      },
    ],
  },
  {
    timestamp: "2026-08-14T13:19:49.825Z",
    changes: [
      {
        emoji: "🟢",
        sv: "Självskattningen på teknikkorten visas nu med tre kompakta prickar, så att dina framsteg syns utan att ta onödig plats.",
        en: "Self-assessment on technique cards now uses three compact dots, showing your progress without taking up unnecessary space.",
        tr: "Teknik kartlarındaki öz değerlendirme artık üç kompakt noktayla gösteriliyor; böylece ilerlemeniz gereksiz yer kaplamadan görülebiliyor.",
        ja: "技法カードの自己評価を3つのコンパクトな点で表示し、場所を取らずに進捗を確認できるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-08-14T13:06:42.171Z",
    changes: [
      {
        emoji: "✅",
        sv: "Du kan nu klarmarkera de stora områdena under Grunder och Teoretiska ämnen. Räknaren visar dina framsteg för den valda graden, och markeringarna följer med mellan dina enheter.",
        en: "You can now mark the large areas under Fundamentals and Theory subjects as complete. The counter shows your progress for the selected grade, and completion marks follow you across devices.",
        tr: "Artık Temeller ve Teorik konular altındaki büyük alanları tamamlandı olarak işaretleyebilirsiniz. Sayaç seçilen derece için ilerlemenizi gösterir ve tamamlanma işaretleri cihazlarınız arasında aktarılır.",
        ja: "「基礎」と「学科科目」の大きな項目を完了として記録できるようになりました。選択した級・段ごとの進捗が表示され、完了状況は端末間で引き継がれます。",
      },
    ],
  },
  {
    timestamp: "2026-08-14T12:52:51.343Z",
    changes: [
      {
        emoji: "🧹",
        sv: "Grunder på graderingssidan är nu uppdelade i tydliga grupper och lugna, utfällbara rader. Kroppsställningar, kroppsföring och fotförflyttning har fått egna rubriker så innehållet blir lättare att överblicka.",
        en: "Fundamentals on the grading page are now divided into clear groups and calm, expandable rows. Stances, body movement, and footwork have their own headings, making the content easier to scan.",
        tr: "Derecelendirme sayfasındaki temeller artık açık gruplara ve sade, genişletilebilir satırlara ayrıldı. Duruşlar, vücut hareketi ve ayak çalışması kendi başlıklarına sahip, böylece içerik daha kolay gözden geçirilebilir.",
        ja: "昇格考試ページの基礎科目を、分かりやすいグループと落ち着いた展開式の行に整理しました。体構え・体捌き・運歩法にそれぞれ見出しが付き、内容を確認しやすくなりました。",
      },
    ],
  },
  {
    timestamp: "2026-08-14T11:22:27.004Z",
    changes: [
      {
        emoji: "🥋",
        sv: "Graderingssidan är nu lugnare och tydligare, med områden som anpassas efter vald grad. Grunder, utvalda tekniker, embu och tillämpning är lättare att hitta, och bakåtknappen går ett steg i taget.",
        en: "The grading page is now calmer and clearer, with areas adapted to the selected grade. Fundamentals, selected techniques, embu, and application are easier to find, and the Back button moves one step at a time.",
        tr: "Derecelendirme sayfası artık seçilen seviyeye uyarlanan bölümlerle daha sade ve anlaşılır. Temelleri, seçili teknikleri, embu ve uygulamayı bulmak daha kolay; Geri düğmesi de her seferinde tek adım geri gider.",
        ja: "昇格考試ページが、選択した級・段に合わせた、より見やすく落ち着いた構成になりました。基礎・指定技・演武・運用法を探しやすくし、戻るボタンは一段階ずつ戻るようになりました。",
      },
      {
        emoji: "🈶",
        sv: "Kanji visas nu automatiskt i vanliga träningsvyer. Den överflödiga inställningen ”Visa kanji” är borttagen; Dojoläge behåller sin tidigare betydelse och visar den avskalade träningsvyn.",
        en: "Kanji is now shown automatically in regular training views. The redundant “Show kanji” setting has been removed; Dojo mode keeps its previous meaning and presents the streamlined practice view.",
        tr: "Kanji artık normal antrenman görünümlerinde otomatik olarak gösteriliyor. Gereksiz “Kanji göster” ayarı kaldırıldı; Dojo modu önceki anlamını koruyarak sadeleştirilmiş antrenman görünümünü sunuyor.",
        ja: "通常の練習画面では漢字が自動的に表示されるようになりました。不要になった「漢字を表示」設定を削除し、道場モードはこれまでどおり練習に集中した簡潔な表示になります。",
      },
      {
        emoji: "🎨",
        sv: "Valda menyalternativ och kombinationsrutor följer nu appens temafärger med tydligare kontrast. Ditt sparade ljusa eller mörka tema används dessutom direkt när appen öppnas.",
        en: "Selected menu items and combo boxes now follow the app's theme colors with clearer contrast. Your saved light or dark theme is also applied as soon as the app opens.",
        tr: "Seçili menü öğeleri ve açılır kutular artık daha belirgin kontrastla uygulamanın tema renklerini kullanıyor. Kaydedilmiş açık veya koyu temanız da uygulama açılır açılmaz uygulanıyor.",
        ja: "選択中のメニュー項目とコンボボックスが、より見やすいコントラストでアプリのテーマカラーに沿うようになりました。保存したライト／ダークテーマも、アプリを開いた直後から反映されます。",
      },
      {
        emoji: "✒️",
        sv: "Appens nya standardtypsnitt är Open Sans för brödtext, Lora för rubriker och Shippori Mincho för japansk text.",
        en: "The app's new default typefaces are Open Sans for body text, Lora for headings, and Shippori Mincho for Japanese text.",
        tr: "Uygulamanın yeni varsayılan yazı tipleri gövde metni için Open Sans, başlıklar için Lora ve Japonca metin için Shippori Mincho'dur.",
        ja: "アプリの標準フォントが、本文は Open Sans、見出しは Lora、日本語は Shippori Mincho になりました。",
      },
    ],
  },
  {
    timestamp: "2026-08-13T07:55:16.602Z",
    changes: [
      {
        emoji: "🧭",
        sv: "Teknikgrupper finns nu under Teori. Graderingsinformationen är uppdelad så att teoriämnen finns under Teori och teknikämnen under Träning.",
        en: "Technique groups are now under Theory. Grading information is split so that theory subjects are under Theory and technical subjects are under Training.",
        tr: "Teknik grupları artık Teori bölümünde. Derecelendirme bilgileri, teorik konular Teori altında ve teknik konular Antrenman altında olacak şekilde ayrıldı.",
        ja: "技術グループは「学習」に移動しました。昇格考試情報は、学科科目を「学習」、技術科目を「練習」で確認できるように分けました。",
      },
      {
        emoji: "🎚️",
        sv: "Gradväljaren och Träningsläge har samlats i en diskret flytande knapp som bara visas där den behövs. Träningsläget förenklar träningsvyn och håller skärmen vaken när enheten stöder det.",
        en: "The grade selector and Training mode are now gathered in a discreet floating button that only appears where needed. Training mode simplifies the training view and keeps the screen awake when supported by the device.",
        tr: "Seviye seçici ve Antrenman modu, yalnızca gerektiği yerlerde görünen sade bir yüzen düğmede birleştirildi. Antrenman modu antrenman görünümünü sadeleştirir ve cihaz destekliyorsa ekranı açık tutar.",
        ja: "表示する級・段の選択と練習モードを、必要なページだけに現れる控えめなフローティングボタンにまとめました。練習モードでは練習画面を簡潔にし、対応端末では画面が消えないようにします。",
      },
    ],
  },
  {
    timestamp: "2026-08-13T04:31:20.000Z",
    changes: [
      {
        emoji: "💬",
        sv: "\"Skicka feedback\" i menyn öppnar nu ett formulär i appen istället för din e-postapp. Meddelandet skickas direkt till utvecklaren.",
        en: "\"Send feedback\" in the menu now opens an in-app form instead of your email app. The message goes straight to the developer.",
        tr: "Menüdeki \"Geri bildirim gönder\" artık e-posta uygulamanız yerine uygulama içi bir form açıyor. Mesaj doğrudan geliştiriciye gidiyor.",
        ja: "メニューの「フィードバックを送る」は、メールアプリの代わりにアプリ内フォームを開くようになりました。メッセージは開発者に直接届きます。",
      },
    ],
  },
  {
    timestamp: "2026-08-12T19:56:04.413Z",
    changes: [
      {
        emoji: "🔐",
        sv: "Appen kräver nu ett konto. Det räcker med din e-postadress för att logga in, och dina anteckningar, självskattningar och inställningar följer med till alla dina enheter automatiskt.",
        en: "The app now requires an account. Your email address is enough to sign in, and your notes, self-assessments, and settings follow you to all your devices automatically.",
        tr: "Uygulama artık bir hesap gerektiriyor. Giriş yapmak için e-posta adresiniz yeterli; notlarınız, öz değerlendirmeleriniz ve ayarlarınız tüm cihazlarınıza otomatik olarak taşınır.",
        ja: "アプリの利用にアカウントが必要になりました。ログインはメールアドレスだけででき、メモ・自己評価・設定はすべての端末に自動で引き継がれます。",
      },
      {
        emoji: "☁️",
        sv: "Synk mot OneDrive och Google Drive har tagits bort. Den behövdes när appen saknade egen server, men nu sköts allt automatiskt när du är inloggad — inget att koppla in eller förnya.",
        en: "Syncing to OneDrive and Google Drive has been removed. It was needed back when the app had no server of its own; now everything is handled automatically while you're signed in — nothing to connect or renew.",
        tr: "OneDrive ve Google Drive senkronizasyonu kaldırıldı. Uygulamanın kendi sunucusu yokken gerekliydi; artık giriş yaptığınızda her şey otomatik olarak hallediliyor — bağlanacak veya yenileyecek bir şey yok.",
        ja: "OneDrive と Google ドライブへの同期を廃止しました。アプリに専用サーバーがなかった頃は必要でしたが、今はログインしていればすべて自動で同期され、接続や再認証の手間はありません。",
      },
      {
        emoji: "💾",
        sv: "Du kan fortfarande ladda ner en säkerhetskopia av dina data, eller importera en tidigare nedladdning, under Inställningar.",
        en: "You can still download a backup of your data, or import an earlier download, under Settings.",
        tr: "Ayarlar bölümünden verilerinizin bir yedeğini indirmeye veya daha önce indirdiğiniz bir yedeği içe aktarmaya devam edebilirsiniz.",
        ja: "設定からデータのバックアップをダウンロードしたり、以前のバックアップを読み込んだりすることは引き続き可能です。",
      },
    ],
  },
  {
    timestamp: "2026-08-12T18:30:00.000Z",
    changes: [
      {
        emoji: "🧭",
        sv: "Appen har fått tydligare ingångar för träning och teori. Under Träning väljer du nu mellan veckans träning och fri träning, medan ordlista, quiz och flashkort finns samlade under Teori.",
        en: "The app now has clearer entrances for training and theory. Under Training you can choose between the weekly plan and free practice, while the word list, quiz, and flashcards are gathered under Theory.",
        tr: "Uygulamada antrenman ve teori için daha anlaşılır girişler var. Antrenman altında haftalık plan ile serbest çalışma arasında seçim yapabilir; sözlük, quiz ve bilgi kartlarını Teori altında bulabilirsiniz.",
        ja: "練習と学習への入口がより分かりやすくなりました。「練習」では週間メニューと自由練習を選べ、用語集・クイズ・フラッシュカードは「学習」にまとめられています。",
      },
      {
        emoji: "🥋",
        sv: "Fri träning samlar Kihon, Hokei, Tan’en och Sōtai, Randori samt Embu och Kumi-embu. Du kan växla mellan områden utan att tappa det du höll på med.",
        en: "Free practice brings together Kihon, Hokei, Tan'en and Sōtai, Randori, and Embu and Kumi-embu. You can move between areas without losing what you were doing.",
        tr: "Serbest çalışma; Kihon, Hokei, Tan'en ve Sōtai, Randori ile Embu ve Kumi-embu bölümlerini bir araya getiriyor. Yaptığınız çalışmayı kaybetmeden bölümler arasında geçiş yapabilirsiniz.",
        ja: "自由練習に、基本・法形・単演と相対・乱捕り・演武と組演武がまとまりました。途中の状態を保ったまま各分野を行き来できます。",
      },
      {
        emoji: "📅",
        sv: "Veckans träning visar veckans fokus tydligare och låter dig markera en vecka som tränad. Markeringen sparas tillsammans med datumet så att det blir lättare att hålla reda på var du är.",
        en: "Weekly training presents the week's focus more clearly and lets you mark a week as completed. The completion date is saved, making it easier to keep track of where you are.",
        tr: "Haftalık antrenman, haftanın odağını daha açık gösteriyor ve bir haftayı tamamlandı olarak işaretlemenizi sağlıyor. Nerede kaldığınızı takip edebilmeniz için tamamlanma tarihi de kaydediliyor.",
        ja: "週間練習では、その週の重点がより分かりやすく表示され、練習済みとして記録できるようになりました。完了日も保存されるため、進み具合を確認しやすくなります。",
      },
      {
        emoji: "🎴",
        sv: "Teknikkorten har fått ett lugnare fokusläge och tydligare självskattning. När ett kort är öppet stänger bakåtknappen eller bakåtgesten kortet först, i stället för att lämna sidan.",
        en: "Technique cards now have a calmer focus view and clearer self-assessment. When a card is open, the Back button or gesture closes the card first instead of leaving the page.",
        tr: "Teknik kartları artık daha sakin bir odak görünümüne ve daha anlaşılır öz değerlendirmeye sahip. Bir kart açıkken geri düğmesi veya geri hareketi sayfadan çıkmak yerine önce kartı kapatır.",
        ja: "技のカードに、より落ち着いた集中表示と分かりやすい自己評価が加わりました。カードを開いているときは、戻るボタンや戻るジェスチャーでページを離れず、まずカードが閉じます。",
      },
      {
        emoji: "🔎",
        sv: "Ord och begrepp kan slås upp direkt utan att lämna sidan: markera text på dator eller håll fingret på ett ord på mobilen för att öppna en liten ordlisteruta.",
        en: "Words and terms can now be looked up without leaving the page: select text on a computer or press and hold a word on mobile to open a small dictionary panel.",
        tr: "Artık sayfadan ayrılmadan kelime ve terim arayabilirsiniz: bilgisayarda metni seçin veya mobilde bir kelimeye basılı tutarak küçük sözlük penceresini açın.",
        ja: "ページを離れずに言葉や用語を調べられるようになりました。パソコンでは文字を選択し、スマートフォンでは言葉を長押しすると、小さな用語集が開きます。",
      },
      {
        emoji: "⚠️",
        sv: "Under Embu finns en första experimentell prototyp för att bygga en egen Embu av befintliga tekniker. Utkastet sparas bara på den här enheten och kommer att försvinna när prototypen ersätts av den färdiga lösningen.",
        en: "Embu now includes an early experimental prototype for building your own Embu from existing techniques. The draft is saved only on this device and will be lost when the prototype is replaced by the finished solution.",
        tr: "Embu bölümünde mevcut tekniklerden kendi Embu'nuzu oluşturmanız için erken aşamada deneysel bir prototip bulunuyor. Taslak yalnızca bu cihazda saklanır ve prototip tamamlanmış çözümle değiştirildiğinde kaybolur.",
        ja: "演武には、既存の技から自分の演武を組み立てる初期段階の実験的な試作機能が追加されました。下書きはこの端末にのみ保存され、正式版に置き換わる際に失われます。",
      },
    ],
  },
  {
    timestamp: "2026-08-12T12:00:00.000Z",
    changes: [
      {
        emoji: "🌐",
        sv: "Inloggningssidan har fått språklänkar längst ner – välj Svenska, English, Türkçe eller 日本語 direkt, oavsett vad appen annars skulle ha valt åt dig.",
        en: "The login screen now has language links at the bottom — pick Svenska, English, Türkçe, or 日本語 directly, regardless of what the app would otherwise have chosen for you.",
        tr: "Giriş ekranının altına dil bağlantıları eklendi — uygulamanın sizin için seçtiği dilden bağımsız olarak doğrudan Svenska, English, Türkçe veya 日本語'yi seçebilirsiniz.",
        ja: "ログイン画面の下部に言語リンクが追加されました。アプリが自動的に選んだ言語に関わらず、Svenska、English、Türkçe、日本語を直接選択できます。",
      },
    ],
  },
  {
    timestamp: "2026-08-09T21:15:00.000Z",
    changes: [
      {
        emoji: "✉️",
        sv: "Svar på inloggningsmejlet går inte längre till en obevakad brevlåda.",
        en: "Replying to the sign-in code email no longer goes to an unmonitored inbox.",
        tr: "Giriş kodu e-postasına verilen yanıtlar artık izlenmeyen bir gelen kutusuna gitmiyor.",
        ja: "ログインコードのメールに返信しても、監視されていない受信箱には届かなくなりました。",
      },
    ],
  },
  {
    timestamp: "2026-08-09T18:30:00.000Z",
    changes: [
      {
        emoji: "🔑",
        sv: "Åtgärdat ett problem som kunde logga ut dig i onödan om du inte öppnat appen på ett tag under dagen.",
        en: "Fixed an issue that could log you out unnecessarily if you hadn't opened the app for a while during the day.",
        tr: "Gün içinde bir süre uygulamayı açmadıysanız sizi gereksiz yere çıkışa zorlayabilen bir sorun giderildi.",
        ja: "日中しばらくアプリを開いていないと、不要にログアウトされてしまうことがある問題を修正しました。",
      },
    ],
  },
  {
    timestamp: "2026-08-09T16:57:41.128Z",
    changes: [
      {
        emoji: "🎨",
        sv: "Mejlet med inloggningskoden har fått appens utseende, och avsändaren visas nu på ditt språk.",
        en: "The sign-in code email now looks like the app, and the sender is shown in your language.",
        tr: "Giriş kodu e-postası artık uygulamanın görünümünü taşıyor ve gönderen adı kendi dilinizde görünüyor.",
        ja: "ログインコードのメールがアプリのデザインになり、送信者名がご使用の言語で表示されるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-08-09T16:17:10.937Z",
    changes: [
      {
        emoji: "✉️",
        sv: "Inloggningskoder skickas nu från app@shorinjikempo.net. Titta gärna i skräpposten om koden inte dyker upp, och markera den som säker avsändare.",
        en: "Sign-in codes are now sent from app@shorinjikempo.net. If the code doesn't turn up, look in your spam folder and mark the address as safe.",
        tr: "Giriş kodları artık app@shorinjikempo.net adresinden gönderiliyor. Kod gelmezse spam klasörünüze bakın ve adresi güvenli olarak işaretleyin.",
        ja: "ログインコードの送信元が app@shorinjikempo.net になりました。コードが届かない場合は迷惑メールフォルダーをご確認のうえ、このアドレスを安全な送信元として登録してください。",
      },
    ],
  },
  {
    timestamp: "2026-08-08T18:14:40.148Z",
    changes: [
      {
        emoji: "🏠",
        sv: "Appen har flyttat till en ny adress: app.shorinjikempo.net. Spara gärna om ditt bokmärke. Har du appen installerad på hemskärmen bör du installera om den från den nya adressen. Allt ditt sparade material följer med när du loggar in.",
        en: "The app has moved to a new address: app.shorinjikempo.net. Please update your bookmark. If you have the app installed on your home screen, reinstall it from the new address. Everything you have saved comes along when you sign in.",
        tr: "Uygulama yeni bir adrese taşındı: app.shorinjikempo.net. Lütfen yer imininizi güncelleyin. Uygulamayı ana ekranınıza yüklediyseniz, yeni adresten yeniden yükleyin. Kaydettiğiniz her şey giriş yaptığınızda sizinle birlikte gelir.",
        ja: "アプリは新しいアドレス app.shorinjikempo.net に移転しました。ブックマークの更新をお願いします。ホーム画面にアプリをインストールしている場合は、新しいアドレスから入れ直してください。保存した内容はログインすればそのまま引き継がれます。",
      },
    ],
  },
  {
    timestamp: "2026-07-02T00:00:00.000Z",
    changes: [
      {
        emoji: "🌙",
        sv: "Inloggningstjänsten vilar nu utanför kvällstid för att spara resurser. Loggar du in på andra tider kan första försöket ta någon extra sekund medan tjänsten vaknar – sedan går allt som vanligt.",
        en: "The login service now rests outside the evening hours to save resources. If you sign in at other times, the first attempt may take a few extra seconds while it wakes up – after that everything works as usual.",
        tr: "Giriş hizmeti, kaynak tasarrufu için artık akşam saatleri dışında dinlenmede kalıyor. Başka saatlerde giriş yaparsanız, hizmet uyanırken ilk deneme birkaç saniye daha uzun sürebilir – sonrasında her şey her zamanki gibi çalışır.",
        ja: "ログインサービスは、リソースを節約するため夜間の時間帯以外は休止するようになりました。それ以外の時間帯にログインすると、サービスが起動するまで最初の試行に数秒ほど余分にかかることがありますが、その後は通常どおり動作します。",
      },
    ],
  },
  {
    timestamp: "2026-06-16T12:33:44.139Z",
    changes: [
      {
        emoji: "🔑",
        sv: "Rättade ett fel som kunde logga ut dig i onödan när du återvände till en flik efter en stund, särskilt med appen öppen i flera flikar. Inloggningen förnyas nu tyst som det är tänkt.",
        en: "Fixed a bug that could log you out unnecessarily when returning to a tab after a while, especially with the app open in several tabs. Your session now renews silently as intended.",
        tr: "Bir süre sonra bir sekmeye döndüğünüzde, özellikle uygulama birden fazla sekmede açıkken sizi gereksiz yere oturumdan çıkarabilen bir hata düzeltildi. Oturumunuz artık amaçlandığı gibi sessizce yenileniyor.",
        ja: "しばらくしてからタブに戻ったとき、特にアプリを複数のタブで開いている場合に、不必要にログアウトされることがある不具合を修正しました。セッションは意図したとおり静かに更新されるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-06-16T07:19:50.625Z",
    changes: [
      {
        emoji: "🔒",
        sv: "Du kan nu logga ut från alla dina andra enheter direkt i inställningarna – din nuvarande enhet förblir inloggad. Administratörer kan dessutom logga ut en användare från sidan ”Användare”.",
        en: "You can now sign out of all your other devices straight from settings – your current device stays signed in. Administrators can also sign a user out from the “Users” page.",
        tr: "Artık ayarlardan diğer tüm cihazlarınızdaki oturumu doğrudan kapatabilirsiniz; mevcut cihazınız açık kalır. Yöneticiler ayrıca bir kullanıcının oturumunu “Kullanıcılar” sayfasından kapatabilir.",
        ja: "設定から、他のすべてのデバイスのログアウトを直接行えるようになりました（現在のデバイスはログインしたままです）。また、管理者は「ユーザー」ページからユーザーをログアウトさせることができます。",
      },
    ],
  },
  {
    timestamp: "2026-06-15T08:01:42.356Z",
    changes: [
      {
        emoji: "👥",
        sv: "Administratörer har fått en ny sida ”Användare” där de kan se alla som registrerat sig, söka på namn och e-post, justera visningsnamn och utse andra administratörer.",
        en: "Administrators get a new “Users” page where they can see everyone who has signed up, search by name and email, adjust display names, and appoint other administrators.",
        tr: "Yöneticiler için, kaydolan herkesi görebilecekleri, ada ve e-postaya göre arama yapabilecekleri, görünen adları düzenleyebilecekleri ve başka yöneticiler atayabilecekleri yeni bir “Kullanıcılar” sayfası eklendi.",
        ja: "管理者向けに新しい「ユーザー」ページが追加されました。登録したすべてのユーザーを確認でき、名前やメールで検索したり、表示名を変更したり、他のユーザーを管理者に任命したりできます。",
      },
    ],
  },
  {
    timestamp: "2026-06-15T07:40:02.568Z",
    changes: [
      {
        emoji: "🔄",
        sv: "På inloggningssidan hämtar appen nu den senaste versionen automatiskt, så du alltid loggar in i det nyaste. När du redan är inne får du som vanligt välja själv när du vill uppdatera, så att inget avbryter dig mitt i något.",
        en: "On the login screen the app now picks up the latest version automatically, so you always sign in to the newest one. While you're signed in you still choose when to update yourself, so nothing interrupts you mid-task.",
        tr: "Giriş ekranında uygulama artık en son sürümü otomatik olarak alıyor, böylece her zaman en yenisine giriş yaparsınız. Giriş yaptıktan sonra ise güncellemeyi ne zaman yapacağınıza yine siz karar verirsiniz, böylece bir iş sırasında hiçbir şey sizi bölmez.",
        ja: "ログイン画面では、アプリが最新バージョンを自動で取得するようになり、いつでも最新の状態でログインできます。ログイン後は、これまでどおり更新のタイミングをご自身で選べるので、操作の途中で中断されることはありません。",
      },
    ],
  },
  {
    timestamp: "2026-06-13T16:08:57.055Z",
    changes: [
      {
        emoji: "📧",
        sv: "Du kan nu logga in med vilken e-postadress som helst. Har du en adress utan inloggningstjänst (som Google eller Microsoft) skickar vi en kod till din e-post — fyll i koden och ditt namn så är du inne.",
        en: "You can now sign in with any email address. If your address isn't tied to a login provider (like Google or Microsoft), we'll email you a code — enter the code and your name and you're in.",
        tr: "Artık herhangi bir e-posta adresiyle giriş yapabilirsiniz. Adresiniz bir giriş sağlayıcısına (Google veya Microsoft gibi) bağlı değilse, size e-postayla bir kod göndeririz — kodu ve adınızı girin, içeridesiniz.",
        ja: "どのメールアドレスでもログインできるようになりました。Google や Microsoft などのログインサービスに紐づいていないアドレスの場合は、メールでコードをお送りします。コードとお名前を入力すればログイン完了です。",
      },
    ],
  },
  {
    timestamp: "2026-06-11T14:23:11.434Z",
    changes: [
      {
        emoji: "🈯",
        sv: "Graderingstesten visar nu titlar på ditt valda språk med romaji under, och kanji visas bara om du vill. Inställningen som styr kanji heter nu bara ”Visa kanji” och gäller i hela appen, inte bara hokeikorten.",
        en: "The grading tests now show titles in your chosen language with romaji underneath, and kanji only if you want it. The setting that controls kanji is now simply “Show kanji” and applies throughout the app, not just the hokei cards.",
        tr: "Derecelendirme sınavları artık başlıkları seçtiğiniz dilde, altında romaji ile gösteriyor ve kanji yalnızca isterseniz görünüyor. Kanji’yi denetleyen ayar artık sadece “Kanji’yi göster” adını taşıyor ve yalnızca hokei kartlarında değil, uygulamanın tamamında geçerli.",
        ja: "級・段位の審査科目で、タイトルが選んだ言語で表示され、その下にローマ字が並ぶようになりました。漢字は希望する場合のみ表示されます。漢字の表示を切り替える設定は「漢字を表示」という名前になり、法形カードだけでなくアプリ全体に適用されます。",
      },
    ],
  },
  {
    timestamp: "2026-06-11T13:33:12.846Z",
    changes: [
      {
        emoji: "🎨",
        sv: "Korten har fått en lugnare, mjukare design — de tydliga kanterna är borta och ersatta av en svag skugga, så att sidorna känns mindre rutiga och blir behagligare för ögat.",
        en: "Cards have a calmer, softer look — the hard outlines are gone, replaced by a gentle shadow, so pages feel less boxy and are easier on the eyes.",
        tr: "Kartlar daha sakin ve yumuşak bir görünüme kavuştu — keskin çerçeveler kaldırıldı ve yerine hafif bir gölge geldi, böylece sayfalar daha az kutulu görünüyor ve göze daha rahat geliyor.",
        ja: "カードの見た目がより落ち着いた柔らかなデザインになりました。はっきりした枠線をなくし、淡い影に置き換えたことで、画面の四角さが和らぎ、目にやさしくなりました。",
      },
    ],
  },
  {
    timestamp: "2026-06-10T00:00:00.000Z",
    changes: [
      {
        emoji: "🔔",
        sv: "Notiser fungerar nu även när appen är stängd. Aktivera dem under Inställningar för att få ett meddelande när det finns nyheter, till exempel när en ny version är tillgänglig. På iPhone och iPad behöver appen först läggas till på hemskärmen.",
        en: "Notifications now work even when the app is closed. Turn them on under Settings to get a message when there's news, such as when a new version is available. On iPhone and iPad, add the app to your Home Screen first.",
        tr: "Bildirimler artık uygulama kapalıyken de çalışıyor. Yeni bir sürüm gibi haberler olduğunda mesaj almak için Ayarlar'dan açın. iPhone ve iPad'de önce uygulamayı Ana Ekrana ekleyin.",
        ja: "アプリを閉じているときも通知が届くようになりました。設定からオンにすると、新しいバージョンが利用可能になったときなどにお知らせします。iPhoneとiPadでは、まずアプリをホーム画面に追加してください。",
      },
    ],
  },
  {
    timestamp: "2026-06-09T00:00:00.000Z",
    changes: [
      {
        emoji: "⚙️",
        sv: "Nytt inställningsalternativ: välj om kanji ska visas på hokeikort eller inte.",
        en: "New setting: choose whether kanji is shown on hokei cards.",
        tr: "Yeni ayar: hokei kartlarında kanji gösterilip gösterilmeyeceğini seçin.",
        ja: "新しい設定：法形カードに漢字を表示するかどうかを選択できるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-30T19:47:30.202Z",
    changes: [
      {
        emoji: "🎬",
        sv: "Inbäddade videoklipp spelas upp igen. En säkerhetsinställning hade av misstag hindrat YouTube-klippen från att visas i appen.",
        en: "Inline videos play again. A security setting had accidentally stopped the YouTube clips from showing inside the app.",
        tr: "Gömülü videolar yeniden oynatılıyor. Bir güvenlik ayarı, YouTube kliplerinin uygulama içinde gösterilmesini yanlışlıkla engellemişti.",
        ja: "埋め込み動画が再び再生されるようになりました。セキュリティ設定の影響で、YouTubeの動画がアプリ内で表示されなくなっていました。",
      },
    ],
  },
  {
    timestamp: "2026-05-30T19:13:51.338Z",
    changes: [
      {
        emoji: "🔍",
        sv: "När du söker bland hokei visas nu de vars namn matchar din sökning högst upp, före de som bara matchar på innehållet. Tidigare kunde en hokei med sökordet i namnet hamna långt ner i listan.",
        en: "When you search among hokei, those whose name matches your search now appear at the top, before ones that only match on their content. Previously a hokei with your search term in its name could end up far down the list.",
        tr: "Hokei arasında arama yaptığınızda, adı aramanızla eşleşenler artık yalnızca içeriğiyle eşleşenlerden önce en üstte görünüyor. Daha önce, arama teriminiz adında geçen bir hokei listenin çok aşağısında kalabiliyordu.",
        ja: "法形を検索すると、名前が検索語に一致する法形が、内容だけが一致する法形より上に表示されるようになりました。以前は、検索語が名前に含まれる法形でもリストのずっと下に表示されることがありました。",
      },
    ],
  },
  {
    timestamp: "2026-05-30T18:38:06.382Z",
    changes: [
      {
        emoji: "💡",
        sv: "Ny knapp för att hålla skärmen tänd, så att den inte slocknar mitt under träningen. Den slås av automatiskt när du lämnar appen eller byter sida.",
        en: "New control to keep the screen on, so it won't dim in the middle of training. It turns off automatically when you leave the app or switch pages.",
        tr: "Ekranı açık tutmak için yeni bir düğme; böylece antrenmanın ortasında ekran kapanmaz. Uygulamadan çıktığınızda veya sayfa değiştirdiğinizde otomatik olarak kapanır.",
        ja: "画面をオンのままにする新しいボタンを追加しました。練習の途中で画面が暗くなりません。アプリを離れたりページを切り替えたりすると自動的にオフになります。",
      },
    ],
  },
  {
    timestamp: "2026-05-26T17:23:32.311Z",
    changes: [
      {
        emoji: "🔓",
        sv: "Inloggningsknappen visas nu i Inställningar även om du redan använder OneDrive eller Google Drive — tidigare gick det inte att byta till kontoinloggning utan att börja om.",
        en: "The sign-in button now appears in Settings even if you're already using OneDrive or Google Drive — previously there was no way to switch to account sign-in without starting over.",
        tr: "Giriş düğmesi artık OneDrive veya Google Drive kullanıyor olsanız bile Ayarlar'da görünüyor — daha önce sıfırdan başlamadan hesap girişine geçmek mümkün değildi.",
        ja: "OneDriveやGoogle Driveを使用中でも、設定画面にサインインボタンが表示されるようになりました。以前は、最初からやり直さずにアカウントサインインに切り替えることができませんでした。",
      },
      {
        emoji: "✨",
        sv: "Pilen för att fälla ut ett hokeikort har flyttats till övre högra hörnet och håller sig i höjd med första raden av hokei-namnet.",
        en: "The expand chevron on hokei cards has moved to the upper-right corner and now stays aligned with the first line of the hokei name.",
        tr: "Hokei kartlarındaki genişletme oku sağ üst köşeye taşındı ve hokei adının ilk satırıyla hizalı kalıyor.",
        ja: "法形カードの展開シェブロンを右上に移動し、法形名の1行目と揃うようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-26T16:54:29.055Z",
    changes: [
      {
        emoji: "🪳",
        sv: "Hokei på graderingstestsidan visar nu rätt variant för den valda graden — tidigare kunde varianten från en annan grad smyga in när samma hokei förekommer i flera grader.",
        en: "Hokei on the grading test page now show the correct variation for the selected grade — previously a variation from a different grade could leak in when the same hokei appears at multiple grades.",
        tr: "Derecelendirme testi sayfasındaki hokei artık seçilen derece için doğru varyasyonu gösteriyor — daha önce aynı hokei birden fazla derecede göründüğünde farklı bir derecedeki varyasyon araya girebiliyordu.",
        ja: "段位審査ページの法形が、選択した段位に対応する正しいバリエーションを表示するようになりました。以前は、同じ法形が複数の段位に登場する場合、別の段位のバリエーションが混入することがありました。",
      },
    ],
  },
  {
    timestamp: "2026-05-25T16:00:00.000Z",
    changes: [
      {
        emoji: "🔔",
        sv: "Appen kan nu skicka en systemnotis när en ny version är tillgänglig — även när appen är i bakgrunden. Aktivera det i Inställningar.",
        en: "The app can now send a system notification when a new version is available — even while it's in the background. Enable it in Settings.",
        tr: "Uygulama artık yeni bir sürüm mevcut olduğunda sistem bildirimi gönderebilir — arka planda bile. Ayarlar'dan etkinleştirin.",
        ja: "新しいバージョンが利用可能になったときに、アプリがバックグラウンドでもシステム通知を送信できるようになりました。設定から有効にしてください。",
      },
    ],
  },
  {
    timestamp: "2026-05-25T14:00:00.000Z",
    changes: [
      {
        emoji: "🌐",
        sv: "Ordboken visas nu korrekt på engelska och turkiska — ett antal ord saknade översättningar och visades på svenska istället.",
        en: "The word list now displays correctly in English and Turkish — several entries were missing translations and fell back to Swedish.",
        tr: "Kelime listesi artık İngilizce ve Türkçe olarak doğru şekilde görüntüleniyor — bazı girişlerde çeviri eksikti ve İsveççe olarak görünüyordu.",
        ja: "単語帳が英語とトルコ語で正しく表示されるようになりました。一部の項目に翻訳が不足しており、スウェーデン語にフォールバックしていました。",
      },
    ],
  },
  {
    timestamp: "2026-05-24T17:30:00.000Z",
    changes: [
      {
        emoji: "🔒",
        sv: "Integritetspolicyn är nu tillgänglig direkt på inloggningssidan.",
        en: "The privacy policy is now accessible directly from the login screen.",
        tr: "Gizlilik politikasına artık doğrudan giriş ekranından erişilebilir.",
        ja: "プライバシーポリシーがログイン画面から直接確認できるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-24T14:56:38.154Z",
    changes: [
      {
        emoji: "🔐",
        sv: "Du kan nu logga in med ditt Google- eller Microsoft-konto och spara dina framsteg i molnet. Dina data synkas automatiskt mellan enheter.",
        en: "You can now sign in with your Google or Microsoft account and save your progress to the cloud. Your data syncs automatically across devices.",
        tr: "Artık Google veya Microsoft hesabınızla giriş yapabilir ve ilerlemenizi buluta kaydedebilirsiniz. Verileriniz cihazlar arasında otomatik olarak senkronize edilir.",
        ja: "GoogleまたはMicrosoftアカウントでサインインし、進捗をクラウドに保存できるようになりました。データはデバイス間で自動的に同期されます。",
      },
    ],
  },
  {
    timestamp: "2026-05-24T14:06:29.510Z",
    changes: [
      {
        emoji: "🔑",
        sv: "Fixade inloggningen – e-postadresser kunde inte verifieras eftersom backend saknade en route. Nu fungerar inloggning igen.",
        en: "Fixed sign-in – email addresses couldn't be verified because the backend was missing a route. Sign-in works again.",
        tr: "Oturum açma düzeltildi – arka uçta bir rota eksik olduğu için e-posta adresleri doğrulanamıyordu. Oturum açma yeniden çalışıyor.",
        ja: "サインインを修正しました。バックエンドにルートが不足していたためメールアドレスを確認できませんでした。再びサインインできます。",
      },
    ],
  },
  {
    timestamp: "2026-05-22T15:15:00.000Z",
    changes: [
      {
        emoji: "📱",
        sv: "Videoknapparna är nu klickbara i sin helhet – tryck var som helst på knappen för att spela upp videon direkt i appen. YouTube-länken öppnar fortfarande YouTube i en ny flik.",
        en: "Video buttons are now fully clickable – tap anywhere on the button to play the video inside the app. The YouTube link still opens YouTube in a new tab.",
        tr: "Video düğmeleri artık tamamen tıklanabilir – videoyu uygulama içinde oynatmak için düğmenin herhangi bir yerine dokunun. YouTube bağlantısı hâlâ YouTube'u yeni bir sekmede açıyor.",
        ja: "動画ボタン全体がクリック可能になりました。ボタンのどこをタップしてもアプリ内で動画が再生されます。YouTubeリンクは引き続き新しいタブでYouTubeを開きます。",
      },
    ],
  },
  {
    timestamp: "2026-05-22T14:30:00.000Z",
    changes: [
      {
        emoji: "🎬",
        sv: "Videolänkar har lagts till för hokei, kumi embu och tan'en kihon hōkei. Videoknappar visas nu på hokeikort, på graderingssidan och i veckoschemat – med titeln på formen som etikett.",
        en: "Video links added for hokei, kumi embu, and tan'en kihon hōkei. Video buttons now appear on hokei cards, the grading test page, and the weekly schedule – labelled with the name of the form.",
        tr: "Hokei, kumi embu ve tan'en kihon hōkei için video bağlantıları eklendi. Video düğmeleri artık hokei kartlarında, derece sınavı sayfasında ve haftalık programda – formun adıyla etiketlenmiş olarak görünüyor.",
        ja: "法形、組演武、単演基本法形に動画リンクが追加されました。法形カード、段位審査ページ、週間スケジュールに動画ボタンが表示されるようになりました。ボタンには法形の名称が表示されます。",
      },
    ],
  },
  {
    timestamp: "2026-05-21T12:00:00.000Z",
    changes: [
      {
        emoji: "🥋",
        sv: "Graderingstestsidan har fått en ny detaljvy – tryck på ett ämne för att se det i helskärm. Kumi embu och hōkei kamoku visar nu kompakta hokeikort direkt i listan.",
        en: "The grading test page has a new detail view – tap a subject to see it full screen. Kumi embu and hōkei kamoku now show compact hokei cards inline.",
        tr: "Derecelendirme testi sayfasında yeni bir detay görünümü var – tam ekranda görmek için bir konuya dokunun. Kumi embu ve hōkei kamoku artık satır içinde kompakt hokei kartları gösteriyor.",
        ja: "段位審査ページに新しい詳細ビューが追加されました。科目をタップすると全画面で表示されます。組演武と法形科目では、コンパクトな法形カードがリスト内に表示されるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-20T10:00:00.000Z",
    changes: [
      {
        emoji: "🪳",
        sv: "Ett fel har åtgärdats där molnsynkroniseringen i onödan laddade upp data – även när ingenting hade ändrats – på grund av att fältordningen i dokumentet skilde sig åt efter en sammanslagning.",
        en: "Fixed a bug where cloud sync would unnecessarily upload data — even when nothing had changed — because field ordering in the document differed after a merge.",
        tr: "Birleştirme sonrasında belgede alan sıralaması farklılığı nedeniyle hiçbir şey değişmemiş olsa bile bulut senkronizasyonunun gereksiz yere veri yükleyeceği bir hata düzeltildi.",
        ja: "マージ後にドキュメントのフィールド順序が異なるため、何も変更されていないにもかかわらずクラウド同期が不必要にデータをアップロードしてしまうバグを修正しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-20T08:12:00.000Z",
    changes: [
      {
        emoji: "↔️",
        sv: "Svepgesterna för flashkort är omarbetade: svep åt sidan för att gå till nästa kort, svep upp/ner för att markera kortet som inlärt. En ikon visas mitt i kortet och visar vad som händer när du släpper.",
        en: "Flashcard swipe gestures redesigned: swipe sideways to go to the next card, swipe up/down to mark the card as learned. An icon appears in the middle of the card showing what will happen when you release.",
        tr: "Bilgi kartı kaydırma hareketleri yeniden tasarlandı: sonraki karta geçmek için yana, öğrenildi olarak işaretlemek için yukarı/aşağı kaydırın. Bıraktığınızda ne olacağını gösteren bir simge kartın ortasında belirir.",
        ja: "フラッシュカードのスワイプ操作を刷新しました。横にスワイプで次のカードへ、上下にスワイプで習得済みマーク。離したときの動作を示すアイコンがカード中央に表示されます。",
      },
    ],
  },
  {
    timestamp: "2026-05-19T19:45:28.000Z",
    changes: [
      {
        emoji: "🏠",
        sv: "När appen är installerad på telefonen och öppnas igen efter mer än 10 minuters paus, börjar den från startsidan istället för där du var. I vanlig webbläsare påverkas ingenting.",
        en: "When the app is installed on your phone and reopened after more than 10 minutes idle, it starts at the home page instead of where you left off. No change when used in a regular browser.",
        tr: "Uygulama telefonunuza yüklendiğinde ve 10 dakikadan fazla bir aradan sonra yeniden açıldığında, kaldığınız yer yerine ana sayfadan başlar. Normal tarayıcıda kullanımda hiçbir şey değişmez.",
        ja: "アプリを端末にインストールしている場合、10分以上経ってから再度開くと、前回の場所ではなくホーム画面から始まります。通常のブラウザでは動作に変化はありません。",
      },
    ],
  },
  {
    timestamp: "2026-05-19T19:33:43.000Z",
    changes: [
      {
        emoji: "🎴",
        sv: "Svep ett flashkort åt valfritt håll (eller tryck på \"Kan det\") för att markera det som inlärt. Inlärda kort visas inte längre i högen, men du kan när som helst öppna listan med inlärda kort för att rensa eller plocka bort enskilda kort. Listan synkroniseras mellan dina enheter.",
        en: "Swipe a flashcard in any direction (or press \"I know it\") to mark it as learned. Learned cards no longer appear in the deck, but you can open the list of learned cards at any time to clear them or remove individual entries. The list syncs across your devices.",
        tr: "Bir bilgi kartını öğrenildi olarak işaretlemek için herhangi bir yöne sürükleyin (veya \"Biliyorum\"a basın). Öğrenilen kartlar artık destede görünmez; ancak öğrenilen kartlar listesini istediğiniz zaman açarak tümünü temizleyebilir veya tek tek kaldırabilirsiniz. Liste cihazlarınız arasında senkronize edilir.",
        ja: "フラッシュカードを任意の方向にスワイプ（または「分かった」をタップ）すると習得済みとして記録されます。習得済みのカードはデッキに表示されなくなりますが、習得済みカード一覧をいつでも開いて、全件削除や個別削除ができます。一覧は端末間で同期されます。",
      },
    ],
  },
  {
    timestamp: "2026-05-16T16:30:00.000Z",
    changes: [
      {
        emoji: "📋",
        sv: "Graderingstestsidan har fått ett nytt utseende: alla ämnen visas direkt på en sida, och detaljer expanderar på plats istället för att navigera bort.",
        en: "The grading test page has a new look: all subjects are shown on one page, and details expand in place instead of navigating away.",
        tr: "Sınav sayfası yenilendi: tüm konular tek sayfada görünüyor, detaylar sayfa değiştirmeden yerinde açılıyor.",
        ja: "審査ページが新しくなりました。すべての科目が1ページに表示され、詳細はページ遷移なしにその場で展開されます。",
      },
    ],
  },
  {
    timestamp: "2026-05-16T15:00:00.000Z",
    changes: [
      {
        emoji: "☁️",
        sv: "Synkronisering med Google Drive är nu tillgänglig (beta).",
        en: "Sync with Google Drive is now available (beta).",
        tr: "Google Drive ile senkronizasyon artık kullanılabilir (beta).",
        ja: "Google Drive との同期機能が利用可能になりました（ベータ版）。",
      },
    ],
  },
  {
    timestamp: "2026-05-16T14:00:00.000Z",
    changes: [
      {
        emoji: "🐛",
        sv: "Hōkei-listan visade inte tekniker för yondan och högre. Det är nu åtgärdat.",
        en: "The hōkei list was not showing techniques for yondan and above. This has been fixed.",
        tr: "Hōkei listesi yondan ve üzeri için teknikleri göstermiyordu. Bu sorun düzeltildi.",
        ja: "法形リストで四段以上の技が表示されていない不具合を修正しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-16T13:00:00.000Z",
    changes: [
      {
        emoji: "📖",
        sv: "Ordlistan utökad med 52 ord hämtade från hōkei-namnen: teknikbyggstenar (okuri, otoshi, kiri, jime, nami, yubi m.fl.), positioner (uwa, shita, tate, se, han, ryō), natur och djur (tora, tsubame, konoha, hangetsu, mikazuki, ryū, yahazu) och specialtermer (tekubi, kinteki, suigetsu, hagai, kumade, kusshin, idori, chōji, sankaku m.fl.).",
        en: "Word list expanded with 52 entries drawn from hōkei names: technique building blocks (okuri, otoshi, kiri, jime, nami, yubi, etc.), positions (uwa, shita, tate, se, han, ryō), nature and animals (tora, tsubame, konoha, hangetsu, mikazuki, ryū, yahazu), and specialist terms (tekubi, kinteki, suigetsu, hagai, kumade, kusshin, idori, chōji, sankaku, etc.).",
        tr: "Kelime listesi, hōkei adlarından alınan 52 girişle genişletildi: teknik yapı taşları (okuri, otoshi, kiri, jime, nami, yubi vb.), konumlar (uwa, shita, tate, se, han, ryō), doğa ve hayvanlar (tora, tsubame, konoha, hangetsu, mikazuki, ryū, yahazu) ve uzman terimler (tekubi, kinteki, suigetsu, hagai, kumade, kusshin, idori, chōji, sankaku vb.).",
        ja: "法形の名称から52語を抽出して単語リストを拡充しました：技の構成要素（送り・落とし・切り・絞め・波・指など）、位置（上・下・立て・背・半・両）、自然・動物（虎・燕・木の葉・半月・三日月・龍・矢筈）、専門用語（手首・金的・水月・羽交い・熊手・屈身・居捕り・丁字・三角など）。",
      },
    ],
  },
  {
    timestamp: "2026-05-16T12:00:00.000Z",
    changes: [
      {
        emoji: "🔧",
        sv: "Rättade kamokuhyō: angripare och försvarare var ibland förväxlade, och sammansatta aktionssträngar delades upp för tydlighetens skull.",
        en: "Corrected kamokuhyō: attacker and defender were sometimes swapped, and compound action strings were split for clarity.",
        tr: "Kamokuhyō düzeltildi: saldırgan ve savunucu zaman zaman karıştırılmıştı; birleşik eylem dizeleri netlik için ayrıldı.",
        ja: "科目表を修正しました：攻者と守者の記述が入れ替わっている箇所を修正し、複合アクション文字列を明確化のために分割しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T21:30:00.000Z",
    changes: [
      {
        emoji: "📖",
        sv: "Ordlistan kompletterad med 8 sista ord: kroppsdelar (kata, kubi, mune), fotrörelsemönster (sagari, chidori), slagverktyg (tettsui, haito) och dōjō-termen mokusō.",
        en: "Word list completed with 8 final entries: body parts (kata, kubi, mune), footwork patterns (sagari, chidori), striking surfaces (tettsui, haito), and the dōjō term mokusō.",
        tr: "Kelime listesi 8 son girişle tamamlandı: vücut bölümleri (kata, kubi, mune), adım kalıpları (sagari, chidori), vuruş yüzeyleri (tettsui, haito) ve dōjō terimi mokusō.",
        ja: "単語リストを8語で完成しました：身体部位（肩・首・胸）、足運び（下がり・千鳥）、打撃部位（鉄槌・背刀）、道場用語（黙想）。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T21:10:00.000Z",
    changes: [
      {
        emoji: "📖",
        sv: "Ordlistan utökad med 18 fler ord: kroppsdelar (te, hiji/empi, shōtei), teknikmodifierare (oshi, hiki, choku, jūji, ryūsui, tenkan, kagi, komi), låsbegrepp (tembin, kannuki, gote) och träningstermer (kihon kōgi, kihon bōgi, gōhō/jūhō un'yōhō).",
        en: "Word list expanded with 18 more entries: body parts (te, hiji/empi, shōtei), technique modifiers (oshi, hiki, choku, jūji, ryūsui, tenkan, kagi, komi), lock terms (tembin, kannuki, gote), and training terms (kihon kōgi, kihon bōgi, gōhō/jūhō un'yōhō).",
        tr: "Kelime listesi 18 yeni girişle genişletildi: vücut bölümleri (te, hiji/empi, shōtei), teknik değiştiriciler (oshi, hiki, choku, jūji, ryūsui, tenkan, kagi, komi), kilit terimleri (tembin, kannuki, gote) ve antrenman terimleri (kihon kōgi, kihon bōgi, gōhō/jūhō un'yōhō).",
        ja: "単語リストにさらに18語を追加しました：身体部位（手・肘/猿臂・掌底）、技の修飾語（押し・引き・直・十字・流水・転換・鍵・込み）、固め用語（天秤・閂・後手）、稽古用語（基本剛技・基本防技・剛法/柔法運用法）。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T20:45:00.000Z",
    changes: [
      {
        emoji: "📖",
        sv: "Ordlistan utökad med 20 fler ord: kroppsdelar (ashi, ude, kote, koshi, hiza, eri, sode), teknikmodifierare (kihon, ren, dai, kei, age, kaeshi, nuki, maki, yoko) och begrepp (bujutsu, reishō, seiken, uraken).",
        en: "Word list expanded with 20 more entries: body parts (ashi, ude, kote, koshi, hiza, eri, sode), technique modifiers (kihon, ren, dai, kei, age, kaeshi, nuki, maki, yoko), and concepts (bujutsu, reishō, seiken, uraken).",
        tr: "Kelime listesi 20 yeni girişle genişletildi: vücut bölümleri (ashi, ude, kote, koshi, hiza, eri, sode), teknik değiştiriciler (kihon, ren, dai, kei, age, kaeshi, nuki, maki, yoko) ve kavramlar (bujutsu, reishō, seiken, uraken).",
        ja: "単語リストにさらに20語を追加しました：身体部位（足・腕・小手・腰・膝・襟・袖）、技の修飾語（基本・連・第・系・上げ・返し・抜き・巻き・横）、概念語（武術・霊性・正拳・裏拳）。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T20:15:00.000Z",
    changes: [
      {
        emoji: "📖",
        sv: "Ordlistan har utökats med 44 nya ord: stridsställningar (gamae), teknikkomponenter (uke, nage, waza, m.fl.), alla kenkei-namn (niō ken, ryūō ken m.fl.) samt nyckelbegrepp från graderingsprovet.",
        en: "The word list has been expanded with 44 new entries: fighting stances (gamae), technique components (uke, nage, waza, etc.), all kenkei names (niō ken, ryūō ken, etc.), and key grading exam concepts.",
        tr: "Kelime listesi 44 yeni girişle genişletildi: dövüş duruşları (gamae), teknik bileşenler (uke, nage, waza vb.), tüm kenkei adları (niō ken, ryūō ken vb.) ve önemli sınav kavramları.",
        ja: "単語リストに44語を追加しました：構え（各種）、技の要素（受け・投げ・技など）、全拳系名（仁王拳・龍王拳など）、考試の重要語句。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T18:09:30.000Z",
    changes: [
      {
        emoji: "📋",
        sv: "Graderingsinformation för rokudan (6 dan) är nu tillgänglig i appen.",
        en: "Grading exam information for rokudan (6 dan) is now available in the app.",
        tr: "Rokudan (6 dan) için sınav bilgileri artık uygulamada mevcut.",
        ja: "六段の昇格考試実施要目をアプリに追加しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T17:56:00.000Z",
    changes: [
      {
        emoji: "📋",
        sv: "Graderingsinformation för godan (5 dan) är nu tillgänglig i appen.",
        en: "Grading exam information for godan (5 dan) is now available in the app.",
        tr: "Godan (5 dan) için sınav bilgileri artık uygulamada mevcut.",
        ja: "五段の昇格考試実施要目をアプリに追加しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T15:38:03.000Z",
    changes: [
      {
        emoji: "📋",
        sv: "Graderingsinformation för yondan (4 dan) är nu tillgänglig i appen.",
        en: "Grading exam information for yondan (4 dan) is now available in the app.",
        tr: "Yondan (4 dan) için sınav bilgileri artık uygulamada mevcut.",
        ja: "四段の昇格考試実施要目をアプリに追加しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T12:36:05.000Z",
    changes: [
      {
        emoji: "📋",
        sv: "Graderings­information för sandan (3 dan) är nu tillgänglig i appen.",
        en: "Grading exam information for sandan (3 dan) is now available in the app.",
        tr: "Sandan (3 dan) için sınav bilgileri artık uygulamada mevcut.",
        ja: "三段の昇格考試実施要目をアプリに追加しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T14:40:00.000Z",
    changes: [
      {
        emoji: "📚",
        sv: "Rokudans (6 dan) träningsplan är nu tillgänglig: 35 veckor med kyūsho-moment (羅漢圧法 · rakan appō).",
        en: "The rokudan (6 dan) training plan is now available: 35 weeks of kyūsho moments (羅漢圧法 · rakan appō).",
        tr: "Rokudan (6 dan) antrenman planı artık mevcut: 35 hafta kyūsho anı (羅漢圧法 · rakan appō).",
        ja: "六段（6 dan）の訓練計画を追加しました。全35週の急所攻め（羅漢圧法）の項目です。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T14:35:00.000Z",
    changes: [
      {
        emoji: "📚",
        sv: "Godans (5 dan) träningsplan är nu tillgänglig i appen: 42 veckor, inklusive de avslutande kyūsho-momenten (attack mot vitala punkter).",
        en: "The godan (5 dan) training plan is now available in the app: 42 weeks, including the closing kyūsho moments (attacks on vital points).",
        tr: "Godan (5 dan) antrenman planı artık uygulamada mevcut: 42 hafta, son kyūsho anları (hayati noktalara saldırı) dahil.",
        ja: "五段（5 dan）の訓練計画をアプリに追加しました。全42週で、最後の急所攻め（きゅうしょぜめ）の項目を含みます。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T14:30:00.000Z",
    changes: [
      {
        emoji: "📚",
        sv: "Yondans (4 dan) träningsplan är nu tillgänglig i appen, med 59 veckors schema för studera/undervisa-tekniker och hokeimomenter.",
        en: "The yondan (4 dan) training plan is now available in the app, with a 59-week schedule of study/teach techniques and hokei moments.",
        tr: "Yondan (4 dan) antrenman planı artık uygulamada mevcut; 59 haftalık çalışma/öğretme teknikleri ve hokei momentleri içeriyor.",
        ja: "四段（4 dan）の訓練計画をアプリに追加しました。習い・教えの技術とほうけいの瞬間を含む59週間のスケジュールです。",
      },
    ],
  },
  {
    timestamp: "2026-05-12T06:45:48.000Z",
    changes: [
      {
        emoji: "✏️",
        sv: "Sandans (3 dan) träningsplan har gåtts igenom och rättats mot originalets kamokuhyō.",
        en: "The sandan (3 dan) training plan has been reviewed and corrected against the original kamokuhyō.",
        tr: "Sandan (3 dan) antrenman planı orijinal kamokuhyō ile karşılaştırılarak gözden geçirildi ve düzeltildi.",
        ja: "三段（3 dan）の訓練計画を原本の科目表と照合し、見直して修正しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-11T19:47:17.000Z",
    changes: [
      {
        emoji: "✏️",
        sv: "Inställningsetiketten 'Nivå' heter nu 'Min nästa grad'.",
        en: "The settings label 'Level' is now 'My next grade'.",
        tr: "'Seviye' ayar etiketi artık 'Bir sonraki seviyem' olarak gösterilmektedir.",
        ja: "設定の「級」ラベルを「次の級」に変更しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-11T19:35:00.000Z",
    changes: [
      {
        emoji: "📋",
        sv: "Graderingsinformation för nidan (2 dan) tillagd.",
        en: "Grading information for nidan (2 dan) added.",
        tr: "Nidan (2 dan) için derecelendirme bilgisi eklendi.",
        ja: "二段（2 dan）の昇格考試科目を追加しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-11T18:58:00.000Z",
    changes: [
      {
        emoji: "✏️",
        sv: "Flera fel i tekniklistan för nidan har rättats (teknikgrupper, stanser, tekniknamn m.m.) efter granskning mot det ursprungliga kamokuhyo.",
        en: "Several errors in the nidan technique list have been corrected (technique groups, stances, technique names, etc.) after a review against the original kamokuhyo.",
        tr: "Orijinal kamokuhyo ile karşılaştırıldıktan sonra nidan teknik listesindeki birkaç hata düzeltildi (teknik grupları, duruşlar, teknik adları vb.).",
        ja: "原本の科目表と照合し、二段の技術一覧にあったいくつかの誤りを修正しました（技術グループ、構え、技名など）。",
      },
    ],
  },
  {
    timestamp: "2026-05-07T22:30:00.000Z",
    changes: [
      {
        emoji: "📖",
        sv: "Ordlistan visas inte längre för japanska användare – den är avsedd som hjälp för icke-japaner att lära sig japanska termer.",
        en: "The word list is no longer shown to Japanese-language users — it is intended to help non-Japanese speakers learn Japanese terms.",
        tr: "Kelime listesi artık Japonca kullanıcılara gösterilmiyor — Japonca olmayan kullanıcıların Japonca terimleri öğrenmesine yardımcı olmak için tasarlanmıştır.",
        ja: "単語リストは日本語ユーザーには表示されなくなりました。このリストは日本語以外のユーザーが日本語の用語を学ぶためのものです。",
      },
      {
        emoji: "✏️",
        sv: "Engelska och turkiska översättningar i ordlistan har korrigerats och kompletterats – många var tidigare ofullständiga eller inte översatta alls.",
        en: "English and Turkish translations in the word list have been corrected and completed — many were previously incomplete or not translated at all.",
        tr: "Kelime listesindeki İngilizce ve Türkçe çeviriler düzeltildi ve tamamlandı — önceden birçoğu eksik ya da hiç çevrilmemişti.",
        ja: "単語リストの英語・トルコ語訳を修正・補完しました。以前は不完全または未翻訳のものが多くありました。",
      },
      {
        emoji: "✏️",
        sv: "Romaji har lagts till för ett antal ord i ordlistan som tidigare saknade det.",
        en: "Romaji has been added for several words in the word list that previously lacked it.",
        tr: "Daha önce romaji'si olmayan kelime listesindeki birkaç kelimeye romaji eklendi.",
        ja: "単語リストでローマ字が欠けていたいくつかの単語にローマ字を追加しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-07T21:22:00.000Z",
    changes: [
      {
        emoji: "🪳",
        sv: "Sukui kubi nage korrigerad - den hokei tillhör rakan ken.",
        en: "Sukui kubi nage corrected — that hokei belongs to rakan ken.",
        tr: "Sukui kubi nage düzeltildi — bu hokei rakan ken'e aittir.",
        ja: "掬首投を修正しました。この法形は羅漢拳に属します。",
      },
    ],
  },
  {
    timestamp: "2026-05-07T21:11:00.000Z",
    changes: [
      {
        emoji: "📋",
        sv: "Graderingsinformation för alla kyugrader och shodan tillagt.",
        en: "Grading information for all kyū grades and shodan added.",
        tr: "Tüm kyū dereceleri ve shodan için derecelendirme bilgisi eklendi.",
        ja: "全級位と初段の昇格考試情報を追加しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-06T19:00:00.000Z",
    changes: [
      {
        emoji: "📋",
        sv: "Ny sida: Graderingsinformation för din nästa grad.",
        en: "New page: Grading information for your next grade.",
        tr: "Yeni sayfa: Bir sonraki derece için sınav bilgisi.",
        ja: "新機能：次の昇級に向けた考試情報ページを追加しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-06T17:00:00.000Z",
    changes: [
      {
        emoji: "🔥",
        sv: "Quiz visar nu din nuvarande streak och ditt rekord. Rekorder synkas mellan dina enheter.",
        en: "Quiz now shows your current streak and all-time best. High scores sync across your devices.",
        tr: "Quiz artık mevcut serinizi ve tüm zamanların en yüksek skorunu gösteriyor. En yüksek skorlar cihazlarınız arasında senkronize edilir.",
        ja: "クイズに連続正解数と最高記録が表示されるようになりました。最高記録はデバイス間で同期されます。",
      },
    ],
  },
  {
    timestamp: "2026-05-06T16:00:00.000Z",
    changes: [
      {
        emoji: "💾",
        sv: "Listan på hokei-övningar kommer nu ihåg vilken sortering du valde (Alla, Endast egna, etc.) och synkar den med dina övriga enheter.",
        en: "The hokei exercise list now remembers which filter you selected (All, Only own, etc.) and syncs it to your other devices.",
        tr: "Hokei alıştırması listesi artık seçtiğiniz filtreyi (Tümü, Yalnız benimkiler, vb.) hatırlıyor ve diğer cihazlarınızla senkronize ediyor.",
        ja: "ホーケイ運動リストで選択したフィルター（すべて、自分のみなど）を記憶し、他のデバイスと同期するようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-06T14:00:00.000Z",
    changes: [
      {
        emoji: "⚙️",
        sv: "Inställningssidan visar nu en beskrivning av vad export/import-funktionen kan användas till.",
        en: "The Settings page now shows a description of what the export/import feature can be used for.",
        tr: "Ayarlar sayfası artık dışa/içe aktarma özelliğinin ne için kullanılabileceğini gösteren bir açıklama gösteriyor.",
        ja: "設定ページにエクスポート/インポート機能の用途説明が表示されるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-06T13:00:00.000Z",
    changes: [
      {
        emoji: "🛡️",
        sv: "Appen visar nu ett felmeddelande med en omladdningsknapp om något oväntat går fel, istället för att visa en tom sida.",
        en: "The app now shows an error message with a reload button if something unexpected goes wrong, instead of showing a blank page.",
        tr: "Uygulama artık beklenmedik bir şey ters gittiğinde boş bir sayfa göstermek yerine yeniden yükleme düğmesiyle bir hata mesajı gösteriyor.",
        ja: "予期しないエラーが発生した際に、空白のページを表示するのではなく、再読み込みボタン付きのエラーメッセージを表示するようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-06T12:00:00.000Z",
    changes: [
      {
        emoji: "🔄",
        sv: "Om inställningar ändras på flera enheter samtidigt frågar appen nu vilken enhet som har rätt inställningar, istället för att tyst skriva över med den senaste versionen.",
        en: "If settings are changed on multiple devices at the same time, the app now asks which device has the correct settings, instead of silently overwriting with the latest version.",
        tr: "Ayarlar aynı anda birden fazla cihazda değiştirilirse, uygulama artık en son sürümle sessizce üzerine yazmak yerine hangi cihazın doğru ayarlara sahip olduğunu soruyor.",
        ja: "複数のデバイスで同時に設定が変更された場合、最新バージョンで黙って上書きするのではなく、どのデバイスの設定が正しいかを確認するようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-06T11:00:00.000Z",
    changes: [
      {
        emoji: "🔄",
        sv: "Appen synkroniserar nu automatiskt med molnet när du växlar tillbaka till fliken – så att du alltid ser den senaste datan från dina andra enheter.",
        en: "The app now syncs automatically with the cloud when you switch back to the tab – so you always see the latest data from your other devices.",
        tr: "Uygulama artık sekmeye geri döndüğünüzde bulutla otomatik olarak senkronize oluyor – böylece diğer cihazlarınızdaki en güncel verileri her zaman görürsünüz.",
        ja: "タブに戻ったときに自動的にクラウドと同期するようになりました。他のデバイスの最新データが常に表示されます。",
      },
    ],
  },
  {
    timestamp: "2026-05-06T10:00:00.000Z",
    changes: [
      {
        emoji: "🪳",
        sv: "Ett fel har åtgärdats där synkronisering mot molnet kunde radera sparad data – till exempel kenshinumret – om appen öppnades på en ny enhet för första gången.",
        en: "Fixed a bug where syncing to the cloud could delete saved data – such as the kenshi number – when the app was opened on a new device for the first time.",
        tr: "Uygulama yeni bir cihazda ilk kez açıldığında bulut senkronizasyonunun kaydedilmiş verileri (örneğin kenshi numarası) silebileceği bir hata düzeltildi.",
        ja: "新しいデバイスで初めてアプリを開いた際に、クラウドへの同期によって保存済みのデータ（拳士番号など）が削除されることがあるバグを修正しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-06T00:00:00.000Z",
    changes: [
      {
        emoji: "✨",
        sv: "Ändringsloggen har fått emojis som bullets för att göra det lättare att se vad varje uppdatering handlar om.",
        en: "The changelog now uses emoji bullets to make it easier to see what each update is about.",
        tr: "Değişiklik günlüğü artık her güncellemenin ne hakkında olduğunu anlamayı kolaylaştırmak için emoji madde işaretleri kullanıyor.",
        ja: "変更履歴に絵文字の箇条書きを追加し、各アップデートの内容がひと目でわかるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-05T03:00:00.000Z",
    changes: [
      {
        emoji: "📖",
        sv: "Kyohan-sidorna visas nu i teknikkortet tillsammans med ställningar och rörelser, istället för i anteckningssektionen.",
        en: "Kyohan page references are now shown in the technique card alongside stances and actions, instead of inside the notes section.",
        tr: "Kyohan sayfa referansları artık notlar bölümünde değil, teknik kartında duruşlar ve hareketlerle birlikte gösteriliyor.",
        ja: "教範のページ参照が、メモ欄ではなく技のカード内の構えや動作と並んで表示されるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-05T02:00:00.000Z",
    changes: [
      {
        emoji: "📥",
        sv: "Du kan nu importera en tidigare exporterad datafil under Inställningar – Exportera/importera data.",
        en: "You can now import a previously exported data file under Settings – Export/import data.",
        tr: "Artık Ayarlar – Veriyi dışa/içe aktar bölümünden daha önce dışa aktarılmış bir veri dosyasını içe aktarabilirsiniz.",
        ja: "設定の「データのエクスポート/インポート」から、以前エクスポートしたデータファイルをインポートできるようになりました。",
      },
    ],
  },
  {
    timestamp: "2026-05-05T01:00:00.000Z",
    changes: [
      {
        emoji: "☁️",
        sv: "OneDrive-anslutningen visar nu ett tydligt meddelande när sessionen har gått ut, istället för att tyst visa anslutningsknappen igen. En påminnelse om att OneDrive-anslutningar behöver förnyas var 24:e timme visas också.",
        en: "The OneDrive connection now shows a clear message when the session has expired, instead of silently showing the connect button again. A reminder that OneDrive connections need to be re-established every 24 hours is also shown.",
        tr: "OneDrive bağlantısı artık oturum sona erdiğinde, sessizce bağlan düğmesini tekrar göstermek yerine net bir mesaj gösteriyor. OneDrive bağlantılarının her 24 saatte bir yeniden kurulması gerektiğine dair bir hatırlatma da gösteriliyor.",
        ja: "OneDriveの接続が切れた際、接続ボタンを無言で再表示するのではなく、わかりやすいメッセージを表示するようになりました。また、OneDriveの接続は24時間ごとに再確立が必要である旨の案内も表示されます。",
      },
      {
        emoji: "✏️",
        sv: "Den japanska stavningen av \"kihon shohō\" i Kamoku-vyn har korrigerats.",
        en: "The Japanese spelling of \"kihon shohō\" in the Kamoku view has been corrected.",
        tr: "Kamoku görünümündeki \"kihon shohō\" ifadesinin Japonca yazımı düzeltildi.",
        ja: "Kamokuビューの「基本諸法」の日本語表記を修正しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-05T00:00:00.000Z",
    changes: [
      {
        emoji: "🪳",
        sv: "Anteckningar och stjärnbetyg uppdateras nu korrekt när du har flera tekniker öppna samtidigt – ett fel som i sällsynta fall kunde göra att ändringar inte visades i alla kort har åtgärdats.",
        en: "Notes and star ratings now update correctly when multiple techniques are open at the same time – a bug that could occasionally prevent changes from showing across all cards has been fixed.",
        tr: "Birden fazla teknik aynı anda açıkken notlar ve yıldız derecelendirmeleri artık doğru şekilde güncelleniyor – değişikliklerin zaman zaman tüm kartlarda görüntülenmesini engelleyen bir hata düzeltildi.",
        ja: "複数の技を同時に開いているときに、メモと星評価が正しく更新されるようになりました。まれに変更がすべてのカードに反映されないバグが修正されました。",
      },
      {
        emoji: "🛠️",
        sv: "Automatiserade tester och en ny driftsättningspipeline har lagts till – förbättringar som säkerställer stabilitet och gör framtida uppdateringar snabbare och säkrare.",
        en: "Automated tests and a new deployment pipeline have been added — improvements that ensure stability and make future updates faster and safer.",
        tr: "Otomatik testler ve yeni bir dağıtım hattı eklendi — kararlılığı sağlayan ve gelecekteki güncellemeleri daha hızlı ve güvenli hale getiren iyileştirmeler.",
        ja: "自動テストと新しいデプロイパイプラインを追加しました。安定性を確保し、今後のアップデートをより速く安全に行えるようにする改善です。",
      },
      {
        emoji: "🪳",
        sv: "Ett fel som hindrade de automatiserade testerna från att köras korrekt har åtgärdats.",
        en: "A bug that prevented the automated tests from running correctly has been fixed.",
        tr: "Otomatik testlerin doğru çalışmasını engelleyen bir hata düzeltildi.",
        ja: "自動テストが正しく動作しないバグを修正しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-04T00:00:00.000Z",
    changes: [
      {
        emoji: "📚",
        sv: "Träningsmaterialet för 6 kyū till och med 1 dan har granskats mot originalkamokuhyo – kanji, romaji och teknikbeskrivningar har korrigerats och kompletterats.",
        en: "Training material for 6th kyū through 1st dan has been reviewed against the original kamokuhyo — kanji, romaji and technique descriptions have been corrected and filled in.",
        tr: "6. kyū'dan 1. dan'a kadar olan eğitim materyali orijinal kamokuhyo ile karşılaştırılarak gözden geçirildi — kanji, romaji ve teknik açıklamaları düzeltildi ve eksiklikler tamamlandı.",
        ja: "6級から初段までの修練科目を原本と照合し、漢字・ローマ字・技の説明を修正・補完しました。",
      },
    ],
  },
  {
    timestamp: "2026-05-03T00:00:00.000Z",
    changes: [
      {
        emoji: "🪪",
        sv: "Du kan nu spara ditt kenshinummer under Inställningar.",
        en: "You can now save your kenshi number in Settings.",
        tr: "Kenshi numaranızı Ayarlar'da kaydedebilirsiniz.",
        ja: "設定で拳士番号を保存できるようになりました。",
      },
      {
        emoji: "🔄",
        sv: "Synkronisering mot molntjänster är mer pålitlig – appen försöker automatiskt om det uppstår fel.",
        en: "Cloud sync is more reliable – the app automatically retries on errors.",
        tr: "Bulut senkronizasyonu daha güvenilir – hata oluşursa uygulama otomatik olarak yeniden dener.",
        ja: "クラウド同期がより安定しました。エラーが発生した場合、自動的に再試行します。",
      },
      {
        emoji: "✨",
        sv: "Innehållet har nu en maxbredd för bättre läsbarhet på stora skärmar.",
        en: "Content now has a maximum width for better readability on large screens.",
        tr: "İçerik artık büyük ekranlarda daha iyi okunabilirlik için maksimum genişliğe sahiptir.",
        ja: "大きな画面での読みやすさのため、コンテンツの最大幅が設定されました。",
      },
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG.reduce(
  (max, entry) => (entry.timestamp > max ? entry.timestamp : max),
  CHANGELOG[0].timestamp
);
