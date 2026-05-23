import { useContext } from "react";
import { TranslatorContext } from "./i18n";

const isAuthenticated = () => localStorage.getItem("sync-backend-connected") === "true";

const TermsOfServices = () => {
  const translator = useContext(TranslatorContext);
  const authenticated = isAuthenticated();

  return (
    <div>
      <h2>{translator.translate("Användarvillkor")}</h2>
      <p>
        {translator.translate("Den här appen finns för att stödja träning och studier i Shorinji Kempo. Alla som tränar Shorinji Kempo är välkomna att använda den.")}
      </p>
      <p>
        {translator.translate("Du kan välja att spara konfigurations- och studieinställningar i en molnlagringstjänst som du själv väljer, för närvarande OneDrive, Google Drive eller Dropbox. Molnsynk är helt valfritt.")}
      </p>
      <p>
        {translator.translate("Genom att använda appen godkänner du att använda den ansvarsfullt och i linje med vägledning och träningssammanhang i din egen organisation.")}
      </p>

      {authenticated && (
        <>
          <h3>{translator.translate("Inloggade användare")}</h3>
          <p>{translator.translate("Om du skapar ett konto accepterar du att vi lagrar de uppgifter som beskrivs i integritetspolicyn.")}</p>
          <p>{translator.translate("Du kan när som helst radera ditt konto från Inställningar.")}</p>
          <p>{translator.translate("Vi säljer inte dina uppgifter och delar dem inte med tredje part utan ditt samtycke.")}</p>
        </>
      )}
    </div>
  );
};

export default TermsOfServices;
