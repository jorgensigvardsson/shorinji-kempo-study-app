export interface ChangelogChange {
  emoji: string;
  sv: string;
  en: string;
  tr: string;
  ja: string;
}

export interface ChangelogEntry {
  timestamp: string;
  changes: ChangelogChange[];
}

export const CHANGELOG: ChangelogEntry[] = [
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

const LAST_SEEN_KEY = "lastSeenVersion";
export const CURRENT_VERSION = CHANGELOG.reduce(
  (max, entry) => (entry.timestamp > max ? entry.timestamp : max),
  CHANGELOG[0].timestamp
);

export function isChangelogUnseen(): boolean {
  return localStorage.getItem(LAST_SEEN_KEY) !== CURRENT_VERSION;
}

export function markChangelogSeen(): void {
  localStorage.setItem(LAST_SEEN_KEY, CURRENT_VERSION);
}
