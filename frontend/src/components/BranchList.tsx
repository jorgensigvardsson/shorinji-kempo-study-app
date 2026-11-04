import { Link } from "react-router-dom";
import type { Translator } from "../i18n";
import type { AdminOrgBranch } from "../sync/backend";
import MemberCount from "./MemberCount";

interface Props {
  translator: Translator;
  branches: AdminOrgBranch[];
  // Whether the caller may open a branch's own page — its members, and what can
  // be changed about it. Anybody may see that a branch exists; who is in it is
  // for those who administer it, so for everyone else the name is plain text.
  canOpen: (branch: AdminOrgBranch) => boolean;
}

// Branches as the organization pages list them, each with its member count
// beside it where the caller is allowed to know it.
const BranchList = ({ translator, branches, canOpen }: Props) => (
  <div className="d-flex flex-column gap-2">
    {branches.length === 0 && (
      <span className="text-body-secondary">{translator.translate("Inga klubbar här.")}</span>
    )}
    {branches.map(branch => (
      <div key={branch.id}>
        {canOpen(branch)
          ? <Link to={`/admin/branches/${encodeURIComponent(branch.id)}/members`}>{branch.name}</Link>
          : branch.name}
        <MemberCount count={branch.memberCount} className="ms-2" />
      </div>
    ))}
  </div>
);

export default BranchList;
