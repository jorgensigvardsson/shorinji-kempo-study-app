import FederationFlag from "./FederationFlag";

interface Props {
  id: string;
  // The federation's own name, never translated — like every organization name.
  name: string;
}

// A federation as it is named everywhere in the admin pages: its flag and its
// name. Inline, so it can sit inside a link or a heading. The country code that
// identifies it is not shown — the flag already says which country, and the
// code is the system's key rather than anything a reader needs.
const FederationTitle = ({ id, name }: Props) => (
  <>
    <FederationFlag federationId={id} className="me-2" />
    {name}
  </>
);

export default FederationTitle;
