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
      <p>
        {translator.translate("Vi använder inte analysverktyg och vi säljer inte användardata.")}
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
      <p>{translator.translate("Personuppgiftsansvarig: Jörgen Sigvardsson, jorgen.sigvardsson@gmail.com")}</p>
    </div>
  );
};

export default PrivacyPolicy;
