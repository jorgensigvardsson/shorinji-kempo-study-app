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
