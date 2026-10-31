import { Badge } from "react-bootstrap";

interface Props {
  count: number | undefined;
  className?: string;
}

// How many members a branch has, as a bare number beside its name. The server
// leaves the count out when it could not read it, and then so does this —
// a missing number must not pass for an empty branch.
const MemberCount = ({ count, className }: Props) => {
  if (count === undefined) return null;
  return <Badge pill bg="secondary" className={className} data-testid="member-count">{count}</Badge>;
};

export default MemberCount;
