import type { Language } from "./i18n";

export type ChangelogChange = Record<Language, string>;

export interface ChangelogEntry {
  timestamp: string;
  changes: ChangelogChange[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    timestamp: "2026-05-04T00:00:00.000Z",
    changes: [
      {
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
        sv: "Du kan nu spara ditt kenshinummer under Inställningar.",
        en: "You can now save your kenshi number in Settings.",
        tr: "Kenshi numaranızı Ayarlar'da kaydedebilirsiniz.",
        ja: "設定で拳士番号を保存できるようになりました。",
      },
      {
        sv: "Synkronisering mot molntjänster är mer pålitlig – appen försöker automatiskt om det uppstår fel.",
        en: "Cloud sync is more reliable – the app automatically retries on errors.",
        tr: "Bulut senkronizasyonu daha güvenilir – hata oluşursa uygulama otomatik olarak yeniden dener.",
        ja: "クラウド同期がより安定しました。エラーが発生した場合、自動的に再試行します。",
      },
      {
        sv: "Innehållet har nu en maxbredd för bättre läsbarhet på stora skärmar.",
        en: "Content now has a maximum width for better readability on large screens.",
        tr: "İçerik artık büyük ekranlarda daha iyi okunabilirlik için maksimum genişliğe sahiptir.",
        ja: "大きな画面での読みやすさのため、コンテンツの最大幅が設定されました。",
      },
    ],
  },
];

const LAST_SEEN_KEY = "lastSeenVersion";
export const CURRENT_VERSION = CHANGELOG[0].timestamp;

export function isChangelogUnseen(): boolean {
  return localStorage.getItem(LAST_SEEN_KEY) !== CURRENT_VERSION;
}

export function markChangelogSeen(): void {
  localStorage.setItem(LAST_SEEN_KEY, CURRENT_VERSION);
}
