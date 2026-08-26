import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Edge, Node, ReactFlow as ReactFlowType } from "@xyflow/react";
import { TranslatorImplementation } from "./i18n";
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

const translator = new TranslatorImplementation({}, "sv");

const karlstad: AdminOrgBranch = { id: "b-karlstad", name: "Karlstad" };
const tokyo: AdminOrgBranch = { id: "b-tokyo", name: "Tokyo Honbu" };

const sections = [
  { federationId: "SE", title: "Svenska Shorinji Kempoförbundet", branches: [karlstad] },
  { federationId: "", title: "WSKO", branches: [tokyo] },
];

// A card is found by the heading that names it, the same way the list view's
// own test does — a federation's name also appears in its badge and, once a
// caller covers WSKO, on every branch's move destination, so a plain text
// query is ambiguous about which card it belongs to.
const cardFor = (heading: string) => {
  const el = screen.getByText(heading).closest(".card");
  if (el === null) throw new Error(`no card headed ${heading}`);
  return within(el as HTMLElement);
};

type Props = React.ComponentProps<typeof AdminOrganizationTree>;

const baseProps = (): Props => ({
  translator,
  sections,
  atWSKO: true,
  coversFederation: () => true,
  coversBranch: () => true,
  busy: false,
  isEditing: () => false,
  renameControls: () => <div>rename-controls</div>,
  startRename: vi.fn(),
  addingBranchIn: null,
  newBranchName: "",
  setNewBranchName: vi.fn(),
  setAddingBranchIn: vi.fn(),
  setError: vi.fn(),
  createBranch: vi.fn(),
  startMove: vi.fn(),
  focusId: null,
  onFocused: vi.fn(),
});

const renderTree = (overrides: Partial<Props> = {}) => {
  const props = { ...baseProps(), ...overrides };
  render(<MemoryRouter><AdminOrganizationTree {...props} /></MemoryRouter>);
  return props;
};

describe("AdminOrganizationTree", () => {
  beforeEach(() => { capturedFlowRef.current = null; });

  it("renders every federation and WSKO with their branches", async () => {
    renderTree();
    expect(await screen.findByText("Svenska Shorinji Kempoförbundet")).toBeTruthy();
    expect(cardFor("Svenska Shorinji Kempoförbundet").getByText("SE")).toBeTruthy();
    expect(screen.getByText("Karlstad")).toBeTruthy();
    expect(screen.getByText("WSKO")).toBeTruthy();
    expect(screen.getByText("Tokyo Honbu")).toBeTruthy();
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

  // WSKO is a place, not a federation with a code of its own, so it carries no
  // badge and offers no rename — the same rule the list view applies.
  it("gives WSKO no badge and no rename button", async () => {
    renderTree();
    await screen.findByText("Tokyo Honbu");
    const wsko = cardFor("WSKO");
    expect(wsko.queryByText("SE")).toBeNull();
    expect(wsko.queryByRole("button", { name: "Byt namn" })).toBeNull();
    expect(wsko.getByRole("button", { name: "Ny klubb" })).toBeTruthy();
  });

  // WSKO is a node in its own right now, parent to every federation and to
  // whatever answers to none — not a section that merely sits alongside them.
  it("creates a branch directly under WSKO from its own node", async () => {
    const user = userEvent.setup();
    const createBranch = vi.fn();
    renderTree({ addingBranchIn: "", newBranchName: "Vilnius", createBranch });
    await screen.findByText("Tokyo Honbu");

    await user.click(cardFor("WSKO").getByRole("button", { name: "Lägg till" }));
    expect(createBranch).toHaveBeenCalledWith("");
  });

  // A caller scoped to their own federation has no view of WSKO at all — the
  // parent never sends a WSKO section for them, and the root must not appear
  // out of nowhere just because this component knows the word.
  it("shows no WSKO node at all to a caller with no visibility into it", async () => {
    renderTree({ atWSKO: false, sections: [sections[0]] });
    await screen.findByText("Karlstad");
    expect(screen.queryByText("WSKO")).toBeNull();
  });

  it("renames a federation from its own node", async () => {
    const user = userEvent.setup();
    const startRename = vi.fn();
    renderTree({ startRename });
    await screen.findByText("Karlstad");

    await user.click(cardFor("Svenska Shorinji Kempoförbundet").getByRole("button", { name: "Byt namn" }));
    expect(startRename).toHaveBeenCalledWith("federation", "SE", "Svenska Shorinji Kempoförbundet");
  });

  it("renames a branch from its own node", async () => {
    const user = userEvent.setup();
    const startRename = vi.fn();
    renderTree({ startRename });
    await screen.findByText("Karlstad");

    await user.click(cardFor("Karlstad").getByRole("button", { name: "Byt namn" }));
    expect(startRename).toHaveBeenCalledWith("branch", "b-karlstad", "Karlstad");
  });

  it("swaps a node's content for the shared rename controls while it is being edited", async () => {
    renderTree({ isEditing: (kind, id) => kind === "branch" && id === "b-karlstad" });
    await screen.findByText("rename-controls");
    // The rest of the node is gone while editing, not merely covered — a
    // hidden "Byt namn" would still be reachable by keyboard.
    expect(screen.queryByText("Karlstad")).toBeNull();
  });

  it("opens the add-branch form on the federation that was clicked", async () => {
    const user = userEvent.setup();
    const setAddingBranchIn = vi.fn();
    const setNewBranchName = vi.fn();
    const setError = vi.fn();
    renderTree({ setAddingBranchIn, setNewBranchName, setError });
    await screen.findByText("Karlstad");

    await user.click(cardFor("Svenska Shorinji Kempoförbundet").getByRole("button", { name: "Ny klubb" }));
    expect(setAddingBranchIn).toHaveBeenCalledWith("SE");
    expect(setNewBranchName).toHaveBeenCalledWith("");
    expect(setError).toHaveBeenCalledWith(null);
  });

  it("shows the add-branch form only on the federation it was opened for", async () => {
    renderTree({ addingBranchIn: "SE", newBranchName: "Arvika" });
    await screen.findByText("Karlstad");

    const se = cardFor("Svenska Shorinji Kempoförbundet");
    expect((se.getByLabelText("Klubbens namn") as HTMLInputElement).value).toBe("Arvika");
    expect(cardFor("WSKO").queryByLabelText("Klubbens namn")).toBeNull();
  });

  it("creates a branch in the federation whose form was submitted", async () => {
    const user = userEvent.setup();
    const createBranch = vi.fn();
    renderTree({ addingBranchIn: "SE", newBranchName: "Arvika", createBranch });
    await screen.findByText("Karlstad");

    await user.click(cardFor("Svenska Shorinji Kempoförbundet").getByRole("button", { name: "Lägg till" }));
    expect(createBranch).toHaveBeenCalledWith("SE");
  });

  it("offers every branch a move once the caller covers WSKO", async () => {
    const user = userEvent.setup();
    const startMove = vi.fn();
    renderTree({ startMove });
    await screen.findByText("Karlstad");

    await user.click(cardFor("Karlstad").getByRole("button", { name: "Byt förbund" }));
    expect(startMove).toHaveBeenCalledWith(karlstad, "SE");
  });

  // What a federation admin is shown, mirroring the list view: a move needs
  // authority over both the old federation and the new one, which nobody but
  // a WSKO admin has for every branch, so the button is a WSKO-only offer.
  it("hides the move button from a federation admin", async () => {
    renderTree({ atWSKO: false });
    await screen.findByText("Karlstad");
    expect(screen.queryByRole("button", { name: "Byt förbund" })).toBeNull();
  });

  it("hides rename from a caller who does not cover the branch or federation", async () => {
    renderTree({ coversFederation: () => false, coversBranch: () => false });
    await screen.findByText("Karlstad");
    expect(screen.queryByRole("button", { name: "Byt namn" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ny klubb" })).toBeNull();
  });

  // useReactFlow and ReactFlowProvider are the real library here — only the
  // <ReactFlow> component itself is wrapped, to read its props — so this
  // exercises PanToFocusedNode against xyflow's actual internal store, not a
  // stand-in for it.
  describe("panning to a newly created node", () => {
    it("reports back once it has acted on a focusId that matches a node", async () => {
      const onFocused = vi.fn();
      renderTree({ focusId: "SE", onFocused });
      await screen.findByText("Karlstad");
      await waitFor(() => expect(onFocused).toHaveBeenCalledTimes(1));
    });

    // Every node here is given an explicit `measured` size at construction
    // (GROUP_NODE_SIZE / BRANCH_NODE_SIZE) rather than waiting on xyflow's own
    // ResizeObserver-driven pass — this is what proves that choice actually
    // pays off: acting on a just-created node the very first time it appears
    // cannot wait for a measurement that happy-dom would never deliver.
    it("acts on a node present for the very first render, not only after a later one", async () => {
      const onFocused = vi.fn();
      renderTree({ focusId: "b-tokyo", onFocused });
      await screen.findByText("Tokyo Honbu");
      await waitFor(() => expect(onFocused).toHaveBeenCalledTimes(1));
    });

    it("does nothing when there is no focusId", async () => {
      const onFocused = vi.fn();
      renderTree({ focusId: null, onFocused });
      await screen.findByText("Karlstad");
      expect(onFocused).not.toHaveBeenCalled();
    });

    // A focusId naming a node that does not exist — a create that raced a
    // reload, say — should be left alone rather than reported as handled.
    it("leaves an unresolvable focusId for a later render rather than reporting it done", async () => {
      const onFocused = vi.fn();
      renderTree({ focusId: "does-not-exist", onFocused });
      await screen.findByText("Karlstad");
      expect(onFocused).not.toHaveBeenCalled();
    });
  });
});
