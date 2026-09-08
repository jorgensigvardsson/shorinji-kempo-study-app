import { useContext } from "react";
import { TranslatorContext } from "./i18n";

const PrivacyPolicy = () => {
  const translator = useContext(TranslatorContext);

  return (
    <div>
      <h2>{translator.translate("Integritetspolicy")}</h2>
      <p>
        {translator.translate("Appen kräver ett konto, och kontot hör till en klubb. Dina studiedata sparas på din enhet och synkas med vår server så att du kommer åt dem från alla dina enheter.")}
      </p>
      {/* This said "vi använder inte analysverktyg" until the app began sending
          usage statistics, at which point it was simply untrue. What replaced it
          says what is collected rather than what is not, and the section at the
          bottom says it in full. */}
      <p>
        {translator.translate("Vi säljer inte användardata. Appen skickar en liten mängd användningsstatistik som inte innehåller några personuppgifter — se avsnittet Användningsstatistik längst ned.")}
      </p>

      {/* Somebody applying to join has given us their name, address and a few
          words about themselves before they are a user at all. That is personal
          data held on a person with no account, so it is described first — and
          it is the part they can withdraw entirely. */}
      <h3>{translator.translate("Innan du har ett konto")}</h3>
      <p>
        {translator.translate("När du ansöker om medlemskap i en klubb sparar vi din e-postadress, ditt namn, vilken klubb du ansöker till och det meddelande du själv skriver. Klubbens administratörer får se uppgifterna för att kunna ta ställning till din ansökan.")}
      </p>
      <ul>
        <li>{translator.translate("Godkänns ansökan blir den ditt konto, och ansökan raderas.")}</li>
        <li>{translator.translate("Nekas ansökan sparas den i 90 dagar och raderas sedan automatiskt.")}</li>
        <li>{translator.translate("Du kan när som helst ta tillbaka en ansökan som väntar på svar, och då finns ingenting kvar.")}</li>
      </ul>

      <h3>{translator.translate("Uppgifter vi lagrar")}</h3>
      <ul>
        <li>{translator.translate("E-postadress och visningsnamn (tillhandahållet av din identitetsleverantör, t.ex. Google).")}</li>
        <li>{translator.translate("Vilken identitetsleverantör du använder (t.ex. Google).")}</li>
        <li>{translator.translate("Datum för kontoskapande och senaste inloggning.")}</li>
        <li>{translator.translate("Vilken klubb du tillhör, och en eventuell ansökan om att byta klubb.")}</li>
        <li>{translator.translate("Vilket språk du använder appen på, så att mejl vi skickar dig är skrivna på det.")}</li>
        <li>{translator.translate("Din studiedata: dina självvärderingar, anteckningar, flashcard-resultat och inställningar.")}</li>
      </ul>
      <p>{translator.translate("Vi lagrar dessa uppgifter för att du ska kunna komma åt dina studiedata från vilken enhet som helst. Uppgifterna lagras tills du raderar ditt konto.")}</p>

      {/* This used to say that no other user could see anything about you. That
          stopped being true when branches got administrators: somebody has to be
          able to see who is in their club in order to run it. */}
      <h3>{translator.translate("Vem kan se dina uppgifter")}</h3>
      <p>
        {translator.translate("Din studiedata är din egen. Ingen annan användare kan se dina självvärderingar, anteckningar eller resultat.")}
      </p>
      <p>
        {translator.translate("Administratörer för din klubb, för ditt förbund och för organisationen som helhet kan se ditt namn, din e-postadress och vilket inloggningssätt du använder. Det är vad som krävs för att kunna sköta medlemskapet. En administratör för en annan klubb ser dig inte alls.")}
      </p>
      {/* The point worth saying out loud: the roles above are about running a
          membership, and none of them reaches the study data. There is no admin
          read path to a user's document — the persistence service only ever serves
          the document belonging to the caller's own token. */}
      <p>
        {translator.translate("Ingen administratör kan läsa dina anteckningar eller dina självvärderingar — varken klubbens, förbundets eller organisationens. Det finns ingen sådan vy i appen och ingen väg dit via en högre roll: administratörsrollerna sköter medlemskap, inte studier.")}
      </p>
      <p>{translator.translate("Din information är inte krypterad i vila. Den som sköter driften av systemet tekniskt kan därför nå dina uppgifter vid administrativa uppgifter. Det är något annat än administratörsrollerna i organisationen, som inte har den möjligheten.")}</p>
      <p>{translator.translate("Dina uppgifter överförs aldrig till någon annan organisation, vare sig mot betalning eller gratis. Informationen stannar i det här systemet.")}</p>
      <p>{translator.translate("Du kan exportera alla dina uppgifter som en JSON-fil via Inställningar.")}</p>
      <p>{translator.translate("Du kan radera ditt konto och alla tillhörande uppgifter via Inställningar. Raderingen är omedelbar och permanent.")}</p>
      {/* Every claim below is enforced by code rather than by intention, and the
          code is tested: see frontend/src/telemetry.ts and its tests. The page
          path and the location lookup are stripped on the way out because the SDK
          attaches them regardless of configuration — which was discovered by
          reading what had actually arrived, not by trusting the settings. */}
      <h3>{translator.translate("Användningsstatistik")}</h3>
      <p>
        {translator.translate("För att veta hur appen faktiskt används — hur många som använder den, hur ofta, och om den körs installerad på hemskärmen eller i en webbläsare — skickar appen en liten mängd statistik till Microsoft Azure Application Insights. Det sker högst en gång i timmen per enhet.")}
      </p>
      <p>
        {translator.translate("Statistiken innehåller inga personuppgifter. Den innehåller inte ditt namn, din e-postadress eller ditt konto-id. Din IP-adress sparas inte, och ingen plats räknas fram ur den. Vilka sidor du besöker i appen registreras inte.")}
      </p>
      <p>
        {translator.translate("Det enda som identifierar dig är ett kodat värde som räknas fram ur ditt konto-id. Värdet är detsamma på alla dina enheter, så att en person räknas som en person och inte som tre — men det går inte att räkna tillbaka till vem du är.")}
      </p>
      <p>
        {translator.translate("Utöver det registreras vilken sorts webbläsare och vilket operativsystem du använder, och vilken version av appen din enhet kör. Versionen är med för att vi ska kunna se att en uppdatering faktiskt nått ut.")}
      </p>
      <p>
        {translator.translate("Om något går sönder i appen skickas ett felmeddelande med teknisk information om felet, så att det går att rätta. Vi begränsar hur mycket av felet som skickas, och hur ofta samma fel rapporteras.")}
      </p>
      <p>
        {translator.translate("Statistiken sparas i 30 dagar och raderas sedan automatiskt. Den används för att förstå hur appen används och för att hitta fel — aldrig för att följa vad en enskild person gör.")}
      </p>

      <p>{translator.translate("Personuppgiftsansvarig: Jörgen Sigvardsson, jorgen.sigvardsson@gmail.com")}</p>
    </div>
  );
};

export default PrivacyPolicy;
