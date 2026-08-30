import type { CSSProperties } from "react";

// Federations are identified by ISO 3166-1 alpha-2 country code, which is
// exactly what flag-icons' classes are named after — "fi-se", "fi-jp" — so
// the id doubles as the lookup key with no
// table of its own to keep in sync. A second federation for one country is
// documented to become "SE-2"; it is still Swedish, so the suffix is
// stripped before lookup rather than treated as part of the code. "" (a
// branch attached directly to WSKO) is the one id with no flag to show —
// WSKO is an organization, not a country.
function countryCode(federationId: string): string | null {
  const code = federationId.split("-")[0].toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : null;
}

interface Props {
  federationId: string;
  className?: string;
  style?: CSSProperties;
}

// A small flag beside a federation's name. Purely decorative — the name
// beside it already says what it is — so hidden from assistive tech rather
// than announced a second time.
const FederationFlag = ({ federationId, className, style }: Props) => {
  const code = countryCode(federationId);
  if (code === null) return null;
  return <span aria-hidden="true" className={`fi fi-${code}${className ? ` ${className}` : ""}`} style={style} />;
};

export default FederationFlag;
