import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ReactFlow, ReactFlowProvider, Controls, Handle, Position,
  type Node, type Edge, type NodeProps, type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "./hooks";
import type { AdminOrgBranch } from "./sync/backend";
import type { Section } from "./AdminOrganization";
import FederationTitle from "./components/FederationTitle";
import MemberCount from "./components/MemberCount";

// WSKO is the root of the organization rather than a record with a name, so it
// has no id on the wire. React Flow node ids must be non-empty strings, so it
// gets a sentinel here rather than the "" the API and the list view use.
const WSKO_NODE_ID = "wsko";

// Three rows: WSKO itself, then federations (and any branch attached directly
// to WSKO, at the same depth as a federation), and finally the branches that
// belong to a federation. This is not a general tree-layout problem — the
// organization is at most three levels deep — so a column-counting pass is
// enough; nothing here needs d3-hierarchy or an auto-layout engine.
//
// Wider than the widest node (16rem = 256px, the group card) by a comfortable
// margin — the column pitch is a center-to-center distance, so anything
// narrower than the node itself leaves adjacent cards touching or overlapping
// rather than gapped.
const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 160;

// Node sizes, matched to each node's own CSS width (16rem / 14rem) with a
// generous guess at its height. Real browsers re-measure via ResizeObserver
// once mounted and correct any drift on their own; supplying an initial guess
// here only spares a node from sitting in xyflow's unmeasured — and therefore
// invisible-to-the-accessibility-tree — state for that first instant. jsdom
// and happy-dom never fire a real ResizeObserver at all, which is why a test
// reaching a link inside a node needs this to be here unconditionally.
const GROUP_NODE_SIZE = { width: 256, height: 70 };
const BRANCH_NODE_SIZE = { width: 224, height: 60 };

// A federation or WSKO: its name, as a link to its own page — which is where
// anything about it is changed, by whoever may.
interface GroupNodeData extends Record<string, unknown> {
  title: string;
  federationId: string | null; // null for WSKO: no flag
}

// A branch: its name, a link to its members for whoever administers it.
interface BranchNodeData extends Record<string, unknown> {
  branch: AdminOrgBranch;
  canOpen: boolean;
}

// The type string, not just the component name, has to avoid "group": xyflow
// reserves that exact name for its own built-in container node type and
// stamps a `react-flow__node-group` class on anything using it, which pulls
// in that type's default (and here, unwanted) gray background — regardless
// of which component actually renders the node's content.
type GroupFlowNode = Node<GroupNodeData, "orgUnit">;
type BranchFlowNode = Node<BranchNodeData, "branch">;

const GroupNode = ({ data }: NodeProps<GroupFlowNode>) => (
  <div className="nodrag nopan card" style={{ width: "16rem" }}>
    {/* A federation is both a target (the edge down from WSKO) and a source
        (the edges down to its own branches); WSKO itself only ever uses the
        source side. Every edge needs a handle of the matching kind to attach
        to, or xyflow drops it without a warning — which is exactly what was
        happening to every WSKO-to-federation edge before this target handle
        existed. */}
    <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />
    <Handle type="source" position={Position.Bottom} style={{ visibility: "hidden" }} />
    <div className="card-body fw-semibold">
      {data.federationId === null
        ? <Link to="/admin/wsko">{data.title}</Link>
        : (
          <Link to={`/admin/federations/${encodeURIComponent(data.federationId)}`}>
            <FederationTitle id={data.federationId} name={data.title} />
          </Link>
        )}
    </div>
  </div>
);

const BranchNode = ({ data }: NodeProps<BranchFlowNode>) => (
  <div className="nodrag nopan card" style={{ width: "14rem" }}>
    <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />
    <div className="card-body">
      {data.canOpen
        ? <Link to={`/admin/branches/${encodeURIComponent(data.branch.id)}/members`}>{data.branch.name}</Link>
        : data.branch.name}
      <MemberCount count={data.branch.memberCount} className="ms-2" />
    </div>
  </div>
);

// Defined once at module scope: a new object here every render is a documented
// xyflow footgun (it treats a changed nodeTypes reference as a reason to
// remount every node).
const nodeTypes: NodeTypes = { orgUnit: GroupNode, branch: BranchNode };

// No translator: every label drawn here is an organization name, which is never
// translated.
interface Props {
  sections: Section[];
  canOpenBranch: (branch: AdminOrgBranch, federationId: string) => boolean;
}

// The organization as a diagram: WSKO at the top, the federations beneath it,
// their branches beneath them, pannable and zoomable rather than scrolled.
// Like the list view it is a picture, not a control panel — every node is a
// link to the page where that thing is changed.
const AdminOrganizationTree = ({ sections, canOpenBranch }: Props) => {
  const { effectiveTheme } = useTheme();

  const { nodes, edges } = useMemo(() => {
    const groupNodes: Node[] = [];
    const branchNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    const federationSections = sections.filter(s => s.federationId !== "");
    const wskoSection = sections.find(s => s.federationId === "");

    const addBranchNode = (branch: AdminOrgBranch, federationId: string, column: number, row: number, parentId: string) => {
      branchNodes.push({
        id: branch.id,
        type: "branch",
        position: { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT },
        measured: BRANCH_NODE_SIZE,
        draggable: false,
        deletable: false,
        data: { branch, canOpen: canOpenBranch(branch, federationId) } satisfies BranchNodeData,
      });
      flowEdges.push({ id: `${parentId}->${branch.id}`, source: parentId, target: branch.id });
    };

    let column = 0;
    for (const section of federationSections) {
      const startColumn = column;
      for (const branch of section.branches) {
        addBranchNode(branch, section.federationId, column, 2, section.federationId);
        column += 1;
      }
      // An empty federation still reserves a column, so it doesn't collapse
      // onto its neighbour and the two become indistinguishable.
      if (section.branches.length === 0) column += 1;

      const centerColumn = (startColumn + column - 1) / 2;
      groupNodes.push({
        id: section.federationId,
        type: "orgUnit",
        position: { x: centerColumn * COLUMN_WIDTH, y: ROW_HEIGHT },
        measured: GROUP_NODE_SIZE,
        draggable: false,
        deletable: false,
        data: { title: section.title, federationId: section.federationId } satisfies GroupNodeData,
      });
      flowEdges.push({ id: `${WSKO_NODE_ID}->${section.federationId}`, source: WSKO_NODE_ID, target: section.federationId });
    }

    // WSKO itself: parent of every federation, and of every branch that
    // answers to no federation.
    for (const branch of wskoSection?.branches ?? []) {
      addBranchNode(branch, "", column, 1, WSKO_NODE_ID);
      column += 1;
    }

    const rootCenterColumn = column > 0 ? (column - 1) / 2 : 0;
    groupNodes.push({
      id: WSKO_NODE_ID,
      type: "orgUnit",
      position: { x: rootCenterColumn * COLUMN_WIDTH, y: 0 },
      measured: GROUP_NODE_SIZE,
      draggable: false,
      deletable: false,
      data: { title: "WSKO", federationId: null } satisfies GroupNodeData,
    });

    return { nodes: [...groupNodes, ...branchNodes], edges: flowEdges };
  }, [sections, canOpenBranch]);

  return (
    <div style={{ height: "70vh", minHeight: "24rem" }} className="border rounded mb-3">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode={effectiveTheme}
          // xyflow's own dark palette (near-black canvas, its own node/handle
          // colors) doesn't match the app's Bootstrap dark theme, so the seam
          // between the two read as a stray brown-black rectangle behind the
          // cards. Transparent lets the page's own background show through
          // instead — no canvas background, no dot grid.
          style={{ backgroundColor: "transparent" }}
          nodesDraggable={false}
          nodesConnectable={false}
          // elementsSelectable is left at its default (true): xyflow sets
          // `pointer-events: none` on a node's wrapper whenever it is neither
          // selectable nor draggable nor given a click handler — an inherited
          // CSS property, so it silently takes every link inside the node
          // down with it. Selecting only outlines a node; each node is
          // separately marked undraggable and undeletable above, so nothing
          // else that "selectable" implies is actually live.
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default AdminOrganizationTree;
