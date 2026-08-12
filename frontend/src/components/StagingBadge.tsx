import { noTranslate } from "../i18n";
import "./StagingBadge.css";

const IS_STAGING = import.meta.env.VITE_ENVIRONMENT === "staging";

const StagingBadge = () => {
  if (!IS_STAGING) return null;
  return <div className="staging-badge">{noTranslate("Staging environment")}</div>;
};

export default StagingBadge;
