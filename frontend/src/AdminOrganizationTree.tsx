import { useEffect, useMemo, type ReactNode } from "react";
import { Badge, Button, Form, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import {
  ReactFlow, ReactFlowProvider, Controls, Handle, Position, useReactFlow,
  type Node, type Edge, type NodeProps, type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "./hooks";
import type { Translator } from "./i18n";
import type { AdminOrgBranch } from "./sync/backend";
import FederationFlag from "./components/FederationFlag";

// WSKO is the root of the organization rather than a record with a name, so it
// has no id on the wire. React Flow node ids must be non-empty strings, so it
// gets a sentinel here rather than the "" the API and the list view use.
const WSKO_NODE_ID = "wsko";

// Three rows when the caller sees WSKO at all: WSKO itself, federations (and
// any branch attached directly to WSKO, at the same depth as a federation),
// and finally the branches that belong to a federation. A caller scoped to
// their own federation has no WSKO row at all — sections then holds only
// that federation, standing on its own at the top. Either way this is not a
// general tree-layout problem — the organization is at most three levels
// deep — so a column-counting pass is enough; nothing here needs
// d3-hierarchy or an auto-layout engine.
// Wider than the widest node (16rem = 256px, the group card) by a comfortable
// margin — the column pitch is a center-to-center distance, so anything
// narrower than the node itself leaves adjacent cards touching or overlapping
// rather than gapped.
const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 200;

// Node sizes, matched to each node's own CSS width (16rem / 14rem) with a
// generous guess at its height. Real browsers re-measure via ResizeObserver
// once mounted and correct any drift on their own; supplying an initial guess
// here only spares a node from sitting in xyflow's unmeasured — and therefore
// invisible-to-the-accessibility-tree — state for that first instant. jsdom
// and happy-dom never fire a real ResizeObserver at all, which is why a test
// clicking a button inside a node needs this to be here unconditionally.
const GROUP_NODE_SIZE = { width: 256, height: 130 };
const BRANCH_NODE_SIZE = { width: 224, height: 90 };

interface Section {
  federationId: string; // "" for WSKO
  title: string;
  branches: AdminOrgBranch[];
}

interface GroupNodeData extends Record<string, unknown> {
  title: string;
  federationId: string | null; // null for WSKO: no badge, no rename
  isEditing: boolean;
  renameControls: ReactNode;
  canRename: boolean;
  onStartRename: () => void;
  canAddBranch: boolean;
  addOpen: boolean;
  newBranchName: string;
  onNewBranchNameChange: (v: string) => void;
  onAddBranchClick: () => void;
  onCreateBranch: () => void;
  onCancelAddBranch: () => void;
  // Only ever set for the WSKO node: federations are peers of each other, so
  // creating one is a WSKO-level act, the same way a new branch belongs to
  // the federation it joins rather than to some branch already in it.
  canAddFederation: boolean;
  addFederationOpen: boolean;
  newFederationId: string;
  newFederationName: string;
  onNewFederationIdChange: (v: string) => void;
  onNewFederationNameChange: (v: string) => void;
  onAddFederationClick: () => void;
  onCreateFederation: () => void;
  onCancelAddFederation: () => void;
  busy: boolean;
  translator: Translator;
}

interface BranchNodeData extends Record<string, unknown> {
  branch: AdminOrgBranch;
  isEditing: boolean;
  renameControls: ReactNode;
  canRename: boolean;
  onStartRename: () => void;
  canMove: boolean;
  onMove: () => void;
  busy: boolean;
  translator: Translator;
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
    <div className="card-body">
      {data.isEditing ? data.renameControls : (
        <>
          <div className="d-flex justify-content-between align-items-start gap-2">
            <span className="fw-semibold">
              {data.federationId !== null && <FederationFlag federationId={data.federationId} className="me-2" />}
              {data.title}
              {data.federationId !== null && (
                <Badge bg="secondary" className="ms-2">{data.federationId}</Badge>
              )}
            </span>
          </div>
          <div className="d-flex gap-2 mt-2 flex-wrap">
            {data.canRename && (
              <Button size="sm" variant="outline-secondary" disabled={data.busy} onClick={data.onStartRename}>
                {data.translator.translate("Byt namn")}
              </Button>
            )}
            {data.canAddBranch && !data.addOpen && (
              <Button size="sm" variant="outline-primary" disabled={data.busy} onClick={data.onAddBranchClick}>
                {data.translator.translate("Ny klubb")}
              </Button>
            )}
            {data.canAddFederation && !data.addFederationOpen && (
              <Button size="sm" variant="outline-primary" disabled={data.busy} onClick={data.onAddFederationClick}>
                {data.translator.translate("Nytt förbund")}
              </Button>
            )}
          </div>
        </>
      )}

      {data.addOpen && (
        <div className="d-flex flex-column gap-2 mt-2">
          <Form.Control
            size="sm"
            autoFocus
            value={data.newBranchName}
            disabled={data.busy}
            placeholder={data.translator.translate("Klubbens namn")}
            aria-label={data.translator.translate("Klubbens namn")}
            onChange={e => data.onNewBranchNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") data.onCreateBranch(); }}
          />
          <div className="d-flex gap-2">
            <Button size="sm" variant="primary" disabled={data.busy || data.newBranchName.trim() === ""}
                    onClick={data.onCreateBranch}>
              {data.busy ? <Spinner size="sm" /> : data.translator.translate("Lägg till")}
            </Button>
            <Button size="sm" variant="outline-secondary" disabled={data.busy} onClick={data.onCancelAddBranch}>
              {data.translator.translate("Avbryt")}
            </Button>
          </div>
        </div>
      )}

      {data.addFederationOpen && (
        <div className="d-flex flex-column gap-2 mt-2">
          <Form.Control
            size="sm"
            autoFocus
            value={data.newFederationId}
            disabled={data.busy}
            placeholder={data.translator.translate("Landskod")}
            aria-label={data.translator.translate("Landskod")}
            onChange={e => data.onNewFederationIdChange(e.target.value)}
          />
          <Form.Control
            size="sm"
            value={data.newFederationName}
            disabled={data.busy}
            placeholder={data.translator.translate("Förbundets namn")}
            aria-label={data.translator.translate("Förbundets namn")}
            onChange={e => data.onNewFederationNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") data.onCreateFederation(); }}
          />
          <div className="d-flex gap-2">
            <Button size="sm" variant="primary"
                    disabled={data.busy || data.newFederationId.trim() === "" || data.newFederationName.trim() === ""}
                    onClick={data.onCreateFederation}>
              {data.busy ? <Spinner size="sm" /> : data.translator.translate("Lägg till")}
            </Button>
            <Button size="sm" variant="outline-secondary" disabled={data.busy} onClick={data.onCancelAddFederation}>
              {data.translator.translate("Avbryt")}
            </Button>
          </div>
        </div>
      )}
    </div>
  </div>
);

const BranchNode = ({ data }: NodeProps<BranchFlowNode>) => (
  <div className="nodrag nopan card" style={{ width: "14rem" }}>
    <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />
    <div className="card-body">
      {data.isEditing ? data.renameControls : (
        <>
          <Link to={`/admin/branches/${encodeURIComponent(data.branch.id)}/members`}>{data.branch.name}</Link>
          <div className="d-flex gap-2 mt-2 flex-wrap">
            {data.canRename && (
              <Button size="sm" variant="outline-secondary" disabled={data.busy} onClick={data.onStartRename}>
                {data.translator.translate("Byt namn")}
              </Button>
            )}
            {data.canMove && (
              <Button size="sm" variant="outline-danger" disabled={data.busy} onClick={data.onMove}>
                {data.translator.translate("Byt förbund")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  </div>
);

// Defined once at module scope: a new object here every render is a documented
// xyflow footgun (it treats a changed nodeTypes reference as a reason to
// remount every node).
const nodeTypes: NodeTypes = { orgUnit: GroupNode, branch: BranchNode };

interface Props {
  translator: Translator;
  sections: Section[];
  atWSKO: boolean;
  coversFederation: (id: string) => boolean;
  coversBranch: (branch: AdminOrgBranch, federationId: string) => boolean;
  busy: boolean;
  isEditing: (kind: "federation" | "branch", id: string) => boolean;
  renameControls: () => ReactNode;
  startRename: (kind: "federation" | "branch", id: string, name: string) => void;
  addingBranchIn: string | null;
  newBranchName: string;
  setNewBranchName: (v: string) => void;
  setAddingBranchIn: (v: string | null) => void;
  setError: (e: string | null) => void;
  createBranch: (federationId: string) => void;
  addingFederation: boolean;
  newFederationId: string;
  setNewFederationId: (v: string) => void;
  newFederationName: string;
  setNewFederationName: (v: string) => void;
  setAddingFederation: (v: boolean) => void;
  createFederation: () => void;
  startMove: (branch: AdminOrgBranch, from: string) => void;
  // The id of a node just created elsewhere on this page, or null. Set once by
  // the caller right after a create succeeds; this component pans to it and
  // reports back that it has, so the caller can clear it rather than owning
  // any part of the panning itself.
  focusId: string | null;
  onFocused: () => void;
}

// Recenters the viewport on focusId without changing the zoom level — a
// created federation or branch is, almost by definition, off in a part of
// the canvas nobody was already looking at. A child of ReactFlowProvider
// rather than inline in the main component, since useReactFlow only resolves
// inside that provider.
//
// The node it is centering on was, in the same render pass, added to the
// nodes array this component itself just built — with an explicit `measured`
// size (see GROUP_NODE_SIZE/BRANCH_NODE_SIZE), which is what lets getNode
// return real dimensions immediately rather than only after xyflow's own
// ResizeObserver-driven measurement pass completes.
const PanToFocusedNode = ({ focusId, onFocused }: { focusId: string | null; onFocused: () => void }) => {
  const { getNode, getZoom, setCenter } = useReactFlow();

  useEffect(() => {
    if (focusId === null) return;
    const node = getNode(focusId);
    if (node === undefined) return;
    const width = node.measured?.width ?? 0;
    const height = node.measured?.height ?? 0;
    void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      zoom: getZoom(),
      duration: 600,
    });
    onFocused();
  }, [focusId, getNode, getZoom, setCenter, onFocused]);

  return null;
};

// The organization as a diagram: WSKO and each federation across the top,
// their branches beneath them, pannable and zoomable rather than scrolled.
// Every control here is the same one the list view offers — same state, same
// handlers, passed down rather than duplicated — so the two views can never
// drift into offering different things.
const AdminOrganizationTree = ({
  translator, sections, atWSKO, coversFederation, coversBranch, busy,
  isEditing, renameControls, startRename,
  addingBranchIn, newBranchName, setNewBranchName, setAddingBranchIn, setError, createBranch,
  addingFederation, newFederationId, setNewFederationId, newFederationName, setNewFederationName,
  setAddingFederation, createFederation,
  startMove, focusId, onFocused,
}: Props) => {
  const { effectiveTheme } = useTheme();

  const { nodes, edges } = useMemo(() => {
    const groupNodes: Node[] = [];
    const branchNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    const federationSections = sections.filter(s => s.federationId !== "");
    const wskoSection = sections.find(s => s.federationId === "");

    // Federations (and branches attached directly to WSKO) sit one row lower
    // when there is a WSKO node above them to leave room for; without one,
    // they are the top row themselves.
    const midRow = atWSKO ? 1 : 0;
    const leafRow = atWSKO ? 2 : 1;

    const addBranchNode = (branch: AdminOrgBranch, federationId: string, column: number, row: number, parentId: string) => {
      branchNodes.push({
        id: branch.id,
        type: "branch",
        position: { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT },
        measured: BRANCH_NODE_SIZE,
        draggable: false,
        deletable: false,
        data: {
          branch,
          isEditing: isEditing("branch", branch.id),
          renameControls: isEditing("branch", branch.id) ? renameControls() : null,
          canRename: coversBranch(branch, federationId),
          onStartRename: () => startRename("branch", branch.id, branch.name),
          canMove: atWSKO,
          onMove: () => startMove(branch, federationId),
          busy,
          translator,
        } satisfies BranchNodeData,
      });
      flowEdges.push({ id: `${parentId}->${branch.id}`, source: parentId, target: branch.id });
    };

    let column = 0;
    for (const section of federationSections) {
      const startColumn = column;
      for (const branch of section.branches) {
        addBranchNode(branch, section.federationId, column, leafRow, section.federationId);
        column += 1;
      }
      // An empty federation still reserves a column, so it doesn't collapse
      // onto its neighbour and the two become indistinguishable.
      if (section.branches.length === 0) column += 1;

      const centerColumn = (startColumn + column - 1) / 2;
      groupNodes.push({
        id: section.federationId,
        type: "orgUnit",
        position: { x: centerColumn * COLUMN_WIDTH, y: midRow * ROW_HEIGHT },
        measured: GROUP_NODE_SIZE,
        draggable: false,
        deletable: false,
        data: {
          title: section.title,
          federationId: section.federationId,
          isEditing: isEditing("federation", section.federationId),
          renameControls: isEditing("federation", section.federationId) ? renameControls() : null,
          canRename: coversFederation(section.federationId),
          onStartRename: () => startRename("federation", section.federationId, section.title),
          canAddBranch: coversFederation(section.federationId),
          addOpen: addingBranchIn === section.federationId,
          newBranchName,
          onNewBranchNameChange: setNewBranchName,
          onAddBranchClick: () => { setAddingBranchIn(section.federationId); setNewBranchName(""); setError(null); },
          onCreateBranch: () => createBranch(section.federationId),
          onCancelAddBranch: () => setAddingBranchIn(null),
          // A federation is never where another federation gets created — see
          // the WSKO node below, the only one where these are live.
          canAddFederation: false,
          addFederationOpen: false,
          newFederationId: "",
          newFederationName: "",
          onNewFederationIdChange: () => {},
          onNewFederationNameChange: () => {},
          onAddFederationClick: () => {},
          onCreateFederation: () => {},
          onCancelAddFederation: () => {},
          busy,
          translator,
        } satisfies GroupNodeData,
      });
      if (atWSKO) {
        flowEdges.push({ id: `${WSKO_NODE_ID}->${section.federationId}`, source: WSKO_NODE_ID, target: section.federationId });
      }
    }

    // WSKO itself: parent of every federation, and of every branch that
    // answers to no federation. A caller with no visibility into WSKO never
    // reaches this — federationSections above is then everything they see,
    // each one standing alone exactly as it did before WSKO became a node.
    if (atWSKO) {
      for (const branch of wskoSection?.branches ?? []) {
        addBranchNode(branch, "", column, midRow, WSKO_NODE_ID);
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
        data: {
          title: "WSKO",
          federationId: null,
          isEditing: false,
          renameControls: null,
          canRename: false,
          onStartRename: () => {}, // unreachable: canRename is false
          canAddBranch: coversFederation(""),
          addOpen: addingBranchIn === "",
          newBranchName,
          onNewBranchNameChange: setNewBranchName,
          onAddBranchClick: () => { setAddingBranchIn(""); setNewBranchName(""); setError(null); },
          onCreateBranch: () => createBranch(""),
          onCancelAddBranch: () => setAddingBranchIn(null),
          // Federations are peers of each other, so creating one is a
          // WSKO-level act — the reason this is live only here. atWSKO is
          // already guaranteed true inside this block.
          canAddFederation: atWSKO,
          addFederationOpen: addingFederation,
          newFederationId,
          newFederationName,
          onNewFederationIdChange: setNewFederationId,
          onNewFederationNameChange: setNewFederationName,
          onAddFederationClick: () => { setAddingFederation(true); setError(null); },
          onCreateFederation: createFederation,
          onCancelAddFederation: () => setAddingFederation(false),
          busy,
          translator,
        } satisfies GroupNodeData,
      });
    }

    return { nodes: [...groupNodes, ...branchNodes], edges: flowEdges };
  }, [
    sections, atWSKO, coversFederation, coversBranch, busy, isEditing, renameControls, startRename,
    addingBranchIn, newBranchName, setNewBranchName, setAddingBranchIn, setError, createBranch,
    addingFederation, newFederationId, setNewFederationId, newFederationName, setNewFederationName,
    setAddingFederation, createFederation, startMove,
    translator,
  ]);

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
          // CSS property, so it silently takes every button and input inside
          // the node down with it. Selecting only outlines a node; each node
          // is separately marked undraggable and undeletable below, so
          // nothing else that "selectable" implies is actually live.
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
        <PanToFocusedNode focusId={focusId} onFocused={onFocused} />
      </ReactFlowProvider>
    </div>
  );
};

export default AdminOrganizationTree;
