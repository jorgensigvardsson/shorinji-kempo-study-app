import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FederationFlag from "./FederationFlag";

describe("FederationFlag", () => {
  it("renders a flag-icons span for a plain country code", () => {
    const { container } = render(<FederationFlag federationId="SE" />);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.className).toBe("fi fi-se");
  });

  it("lowercases the code, regardless of how the id is cased", () => {
    const { container } = render(<FederationFlag federationId="jp" />);
    expect(container.querySelector("span")?.className).toBe("fi fi-jp");
  });

  it("is hidden from assistive tech — the adjacent name already says what it is", () => {
    const { container } = render(<FederationFlag federationId="SE" />);
    expect(container.querySelector("span")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("appends the caller's own class alongside its own", () => {
    const { container } = render(<FederationFlag federationId="SE" className="ms-2" />);
    expect(container.querySelector("span")?.className).toBe("fi fi-se ms-2");
  });

  // WSKO is an organization, not a country — a branch attached directly to it
  // carries no federation id at all.
  it("renders nothing for an empty federation id", () => {
    const { container } = render(<FederationFlag federationId="" />);
    expect(container.firstChild).toBeNull();
  });

  // Documented in ORGANIZATION-PLAN.md: a second federation for one country
  // becomes "SE-2". It is still a Swedish federation, so it gets Sweden's
  // flag too — the same one "SE" gets, the suffix stripped before lookup.
  it("shows the base country's flag for a suffixed id like a second federation", () => {
    const { container } = render(<FederationFlag federationId="SE-2" />);
    expect(container.querySelector("span")?.className).toBe("fi fi-se");
  });

  it("renders nothing for an id that isn't a two-letter code at all", () => {
    const { container } = render(<FederationFlag federationId="WSKO" />);
    expect(container.firstChild).toBeNull();
  });
});
