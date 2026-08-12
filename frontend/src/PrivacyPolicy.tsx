import { useContext } from "react";
import { TranslatorContext } from "./i18n";

const PrivacyPolicy = () => {
  const translator = useContext(TranslatorContext);

  return (
    <div>
      <h2>{translator.translate("Integritetspolicy")}</h2>
      <p>
        {translator.translate("Appen kräver ett konto. Dina studiedata sparas på din enhet och synkas med vår server så att du kommer åt dem från alla dina enheter.")}
      </p>
      <p>
        {translator.translate("Vi använder inte analysverktyg och vi säljer inte användardata.")}
      </p>

      <h3>{translator.translate("Uppgifter vi lagrar")}</h3>
      <ul>
        <li>{translator.translate("E-postadress och visningsnamn (tillhandahållet av din identitetsleverantör, t.ex. Google).")}</li>
        <li>{translator.translate("Vilken identitetsleverantör du använder (t.ex. Google).")}</li>
        <li>{translator.translate("Datum för kontoskapande och senaste inloggning.")}</li>
        <li>{translator.translate("Din studiedata: dina självvärderingar, anteckningar, flashcard-resultat och inställningar.")}</li>
      </ul>
      <p>{translator.translate("Vi lagrar dessa uppgifter för att du ska kunna komma åt dina studiedata från vilken enhet som helst. Uppgifterna lagras tills du raderar ditt konto.")}</p>
      <p>{translator.translate("Din information delas inte med andra användare. Ingen annan användare kan se din information, inte ens din identitet.")}</p>
      <p>{translator.translate("Din information är inte krypterad i vila. Systemadministratörer kan se dina uppgifter vid administrativa uppgifter.")}</p>
      <p>{translator.translate("Dina uppgifter överförs aldrig till någon annan organisation, vare sig mot betalning eller gratis. Informationen stannar i det här systemet.")}</p>
      <p>{translator.translate("Du kan exportera alla dina uppgifter som en JSON-fil via Inställningar.")}</p>
      <p>{translator.translate("Du kan radera ditt konto och alla tillhörande uppgifter via Inställningar. Raderingen är omedelbar och permanent.")}</p>
      <p>{translator.translate("Personuppgiftsansvarig: Jörgen Sigvardsson, jorgen.sigvardsson@gmail.com")}</p>
    </div>
  );
};

export default PrivacyPolicy;
