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
