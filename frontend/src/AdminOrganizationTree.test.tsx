import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Edge, Node, ReactFlow as ReactFlowType } from "@xyflow/react";
import type { AdminOrgBranch } from "./sync/backend";

// xyflow can only resolve an edge's endpoints from `handleBounds`, which is
// populated by a real `getBoundingClientRect` pass on each rendered `<Handle>`
// element — something happy-dom never performs, so it renders zero edges
// regardless of whether the app's own logic is correct. Capturing the exact
// props handed to `<ReactFlow>` tests the thing this file is actually
// responsible for — which edges get constructed — without depending on
// xyflow's rendering pipeline to prove it.
const { capturedFlowRef } = vi.hoisted(() => ({
  capturedFlowRef: { current: null as { nodes: Node[]; edges: Edge[] } | null },
}));

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  const CapturingReactFlow: typeof ReactFlowType = (props) => {
    // Not a real component the Compiler optimizes — a test double standing in
    // for the library's own <ReactFlow>, existing purely so this file can
    // read the props it was given. The mutation is the whole point of it.
    // eslint-disable-next-line react-hooks/immutability
    capturedFlowRef.current = { nodes: props.nodes ?? [], edges: props.edges ?? [] };
    return <actual.ReactFlow {...props} />;
  };
  return { ...actual, ReactFlow: CapturingReactFlow };
});

import AdminOrganizationTree from "./AdminOrganizationTree";

const karlstad: AdminOrgBranch = { id: "b-karlstad", name: "Karlstad" };
const tokyo: AdminOrgBranch = { id: "b-tokyo", name: "Tokyo Honbu" };

const sections = [
  { federationId: "SE", title: "Svenska Shorinji Kempoförbundet", branches: [karlstad] },
  { federationId: "", title: "WSKO", branches: [tokyo] },
];

const nodeFor = (text: string) => {
  const el = screen.getByText(text).closest(".card");
  if (el === null) throw new Error(`no node showing ${text}`);
  return within(el as HTMLElement);
};

type Props = React.ComponentProps<typeof AdminOrganizationTree>;

const renderTree = (overrides: Partial<Props> = {}) => {
  const props: Props = { sections, canOpenBranch: () => true, ...overrides };
  render(<MemoryRouter><AdminOrganizationTree {...props} /></MemoryRouter>);
  return props;
};

describe("AdminOrganizationTree", () => {
  beforeEach(() => { capturedFlowRef.current = null; });

  it("renders every federation and WSKO with their branches", async () => {
    renderTree();
    expect(await screen.findByText("Svenska Shorinji Kempoförbundet")).toBeTruthy();
    expect(screen.getByText("Karlstad")).toBeTruthy();
    expect(screen.getByText("WSKO")).toBeTruthy();
    expect(screen.getByText("Tokyo Honbu")).toBeTruthy();
  });

  it("shows a branch's member count on its node", async () => {
    renderTree({
      sections: [{ federationId: "SE", title: "Svenska Shorinji Kempoförbundet", branches: [{ ...karlstad, memberCount: 7 }] }],
    });
    await screen.findByText("Karlstad");
    expect(nodeFor("Karlstad").getByTestId("member-count").textContent).toBe("7");
  });

  // A federation node is both a target (the edge down from WSKO) and a
  // source (the edges down to its own branches) — it needs a handle of each
  // kind, or xyflow drops the edge that needs the missing one, silently and
  // without touching the nodes or edges arrays this test reads. That is
  // exactly what happened here once: the federation-to-branch edge worked on
  // its own, which hid that WSKO-to-federation did not.
  it("constructs an edge from WSKO to the federation, and from the federation to its branch", async () => {
    renderTree();
    await screen.findByText("Karlstad");
    const edgeIds = capturedFlowRef.current?.edges.map(e => e.id) ?? [];
    expect(edgeIds).toContain("wsko->SE");
    expect(edgeIds).toContain("SE->b-karlstad");
    expect(edgeIds).toContain("wsko->b-tokyo");
  });

  // WSKO is the root, and always drawn — it is everyone's way to its page.
  it("draws WSKO even with nothing directly under it", async () => {
    renderTree({ sections: [sections[0], { federationId: "", title: "WSKO", branches: [] }] });
    await screen.findByText("Karlstad");
    expect(screen.getByRole("link", { name: "WSKO" }).getAttribute("href")).toBe("/admin/wsko");
  });

  it("links a federation's node to the federation's own page", async () => {
    renderTree();
    await screen.findByText("Karlstad");
    expect(screen.getByRole("link", { name: "Svenska Shorinji Kempoförbundet" }).getAttribute("href"))
      .toBe("/admin/federations/SE");
  });

  // A picture of the organization, not a control panel.
  it("offers nothing to press on any node", async () => {
    renderTree();
    await screen.findByText("Karlstad");
    expect(nodeFor("Karlstad").queryByRole("button")).toBeNull();
    expect(nodeFor("Svenska Shorinji Kempoförbundet").queryByRole("button")).toBeNull();
    expect(nodeFor("WSKO").queryByRole("button")).toBeNull();
  });

  it("links a branch to its members only where the caller may open it", async () => {
    const canOpenBranch = vi.fn((branch: AdminOrgBranch) => branch.id === "b-karlstad");
    renderTree({ canOpenBranch });
    await screen.findByText("Karlstad");

    expect(screen.getByRole("link", { name: "Karlstad" }).getAttribute("href")).toBe("/admin/branches/b-karlstad/members");
    expect(screen.queryByRole("link", { name: "Tokyo Honbu" })).toBeNull();
    expect(screen.getByText("Tokyo Honbu")).toBeTruthy();
    // Asked with the federation each branch sits in — "" being WSKO — since a
    // branch is covered through its federation as well as directly.
    expect(canOpenBranch).toHaveBeenCalledWith(karlstad, "SE");
    expect(canOpenBranch).toHaveBeenCalledWith(tokyo, "");
  });
});
