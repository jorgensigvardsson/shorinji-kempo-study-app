import { useContext } from "react";
import { TranslatorContext } from "./i18n";

const PrivacyPolicy = () => {
  const translator = useContext(TranslatorContext);

  return (
    <div>
      <h2>{translator.translate("Integritetspolicy")}</h2>
      <p>
        {translator.translate("Vi samlar inte in någon personlig information om dig.")}
      </p>
      <p>
        {translator.translate("Appen sparar dina konfigurationsdata lokalt på din enhet. Om du väljer att aktivera molnsynk kan konfigurationsdata, inklusive din valda grad (\"min grad\"), lagras i ditt eget molnlagringskonto (OneDrive, Google Drive eller Dropbox).")}
      </p>
      <p>
        {translator.translate("Vi använder inte analysverktyg och vi säljer inte användardata. Dina data förblir under din kontroll i lokal lagring och/eller i ditt valda molnlagringskonto.")}
      </p>
    </div>
  );
};

export default PrivacyPolicy;
