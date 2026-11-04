import type { Translator } from "./i18n";
import { AdminRequestError } from "./sync/backend";

// What to say when the server turns down a change to the organization — a
// rename, a new branch or federation, a move. Shared by every page that makes
// one, so the same refusal reads the same wherever it happened.
export function orgWriteRefusal(err: unknown, translator: Translator): string {
  if (err instanceof AdminRequestError) {
    // A 404 on a write is the server declining to admit the thing exists for
    // this caller, which to them is the same as not being allowed.
    if (err.status === 403 || err.status === 404) return translator.translate("Du har inte behörighet att göra det.");
    if (err.status === 409) return translator.translate("Det finns redan ett förbund med den koden.");
    if (err.reason === "invalid_federation_id") {
      return translator.translate("Landskoden måste vara en giltig ISO 3166-1 alpha-2-kod, till exempel SE eller JP.");
    }
    if (err.status === 400) return translator.translate("Uppgifterna kunde inte godtas. Kontrollera dem och försök igen.");
  }
  return translator.translate("Ändringen kunde inte sparas. Försök igen.");
}

// What to say when renaming a member is turned down. Its one refusal of its
// own is the 409 for a name owned by Google or Microsoft — the pages offer no
// pencil for those, so reaching it means the page and the server disagree about
// how the member signs in, and the server is the one to believe.
export function memberNameRefusal(err: unknown, translator: Translator): string {
  if (err instanceof AdminRequestError && err.status === 409) {
    return translator.translate("Namnet hanteras av inloggningsleverantören.");
  }
  return orgWriteRefusal(err, translator);
}
