import { Button } from "react-bootstrap";
import { Pencil } from "react-bootstrap-icons";
import type { Translator } from "../i18n";

interface Props {
  translator: Translator;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * The control for renaming whatever the heading beside it names — a branch, a
 * federation. A pencil on the heading rather than a button among the page's
 * actions, because renaming is an edit of that very text. The label is still
 * the words, for anyone who cannot see the icon.
 *
 * The link variant gives it the theme's accent colour — the same gold as the
 * links on these pages — which is what marks it as something to press.
 */
const RenamePencil = ({ translator, disabled, onClick }: Props) => (
  <Button variant="link" size="sm" className="p-1 ms-1 lh-1" disabled={disabled} onClick={onClick}
          aria-label={translator.translate("Byt namn")} title={translator.translate("Byt namn")}>
    <Pencil aria-hidden="true" />
  </Button>
);

export default RenamePencil;
