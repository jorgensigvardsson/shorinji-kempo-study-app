import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The connection string is read once, at module load, because that is what lets an
// environment without one drop the SDK at build time rather than ship it disabled.
// Tests therefore stub the environment and import the module afresh each time.
const ConnectionString = "InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://example.invalid/";

const TestUserId = "9f8e7d6c-1234-4abc-9def-000000000001";
const TestEmail = "member@example.org";

type TrackedEvent = { name: string; properties: Record<string, unknown> };
type TrackedException = { exception: Error; properties: Record<string, unknown> };

// Stands in for the Application Insights SDK, recording what it was asked to send
// and — importantly — running the allow-list initializer over it, so the tests
// exercise the real gate rather than trusting it.
const tracked: { events: TrackedEvent[]; exceptions: TrackedException[]; initializers: Array<(item: unknown) => boolean> } = {
    events: [], exceptions: [], initializers: [],
};

let loadCalls = 0;
let userInfo: { id: string; email: string } | null = null;
let syncListeners: Array<() => void> = [];

// Runs an item past every registered initializer, the way the SDK does before
// sending. Anything an initializer rejects never leaves the device.
const admit = (baseData: { name?: string; properties: Record<string, unknown> }, baseType: string, tags: Record<string, unknown> = {}): boolean =>
    tracked.initializers.every(fn => fn({ baseType, baseData, tags }));

vi.mock("@microsoft/applicationinsights-web", () => ({
    SeverityLevel: { Error: 3 },
    ApplicationInsights: class {
        loadAppInsights() { loadCalls++; }
        addTelemetryInitializer(fn: (item: unknown) => boolean) { tracked.initializers.push(fn); }
        trackEvent(event: TrackedEvent) {
            if (admit({ name: event.name, properties: event.properties }, "EventData")) tracked.events.push(event);
        }
        trackException(ex: TrackedException) {
            if (admit({ properties: ex.properties }, "ExceptionData")) tracked.exceptions.push(ex);
        }
    },
}));

vi.mock("./sync/manager", () => ({
    getSyncManager: () => ({
        getBackendUserInfo: () => userInfo,
        subscribe: (listener: () => void) => {
            syncListeners.push(listener);
            return () => { syncListeners = syncListeners.filter(l => l !== listener); };
        },
    }),
}));

// Imports the module under test with the environment as the test wants it.
// Pass "" for an environment that has not switched telemetry on. Note the plain
// default rather than `string | undefined`: passing undefined explicitly would
// select the default value, which is exactly the opposite of what such a call reads
// as, and cost this file a confusing failure once already.
const loadTelemetry = async (connectionString: string = ConnectionString) => {
    vi.resetModules();
    vi.stubEnv("VITE_APPINSIGHTS_CONNECTION_STRING", connectionString);
    vi.stubEnv("VITE_APP_VERSION", "b61a547");
    return await import("./telemetry");
};

// The pseudonym is computed with crypto.subtle.digest, which is a genuine
// asynchronous operation rather than an already-resolved promise: one turn of the
// event loop is not always enough to see its result, and on a loaded CI runner it
// is reliably not enough.
//
// This was a single setTimeout(0) once, which passed locally, failed roughly one
// run in six, and blocked a production deploy. Waiting for the delivery rather
// than for a duration is what makes it deterministic — a slow machine now takes
// longer rather than failing.
const settle = async (events = 0, exceptions = 0): Promise<void> => {
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));

    // Nothing expected: drain enough turns that anything in flight would have
    // landed, so an assertion that nothing was sent means it.
    if (events === 0 && exceptions === 0) {
        for (let i = 0; i < 30; i++) await tick();
        return;
    }

    for (let i = 0; i < 500; i++) {
        if (tracked.events.length >= events && tracked.exceptions.length >= exceptions) return;
        await tick();
    }
    throw new Error(
        `timed out waiting for ${events} event(s) and ${exceptions} exception(s); ` +
        `saw ${tracked.events.length} and ${tracked.exceptions.length}`);
};

beforeEach(() => {
    localStorage.clear();
    tracked.events = [];
    tracked.exceptions = [];
    tracked.initializers = [];
    loadCalls = 0;
    syncListeners = [];
    userInfo = { id: TestUserId, email: TestEmail };
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: () => ({ matches: false }),
    });
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
});

describe("usage events", () => {
    it("reports who, which build, and whether the app is installed", async () => {
        const { recordUsage } = await loadTelemetry();

        recordUsage();
        await settle(1);

        expect(tracked.events).toHaveLength(1);
        const event = tracked.events[0];
        expect(event.name).toBe("usage");
        expect(event.properties.ver).toBe("b61a547");
        expect(event.properties.mode).toBe("browser");
        expect(event.properties.uid).toMatch(/^[0-9a-f]{16}$/);
    });

    it("recognises an app installed to a home screen", async () => {
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: (query: string) => ({ matches: query.includes("standalone") }),
        });
        const { recordUsage } = await loadTelemetry();

        recordUsage();
        await settle(1);

        expect(tracked.events[0].properties.mode).toBe("standalone");
    });

    // The iOS home-screen case, which reports through neither display-mode query.
    // Missing it would count every installed iPhone as a browser.
    it("recognises an iOS home-screen app through navigator.standalone", async () => {
        Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
        const { recordUsage } = await loadTelemetry();

        recordUsage();
        await settle(1);

        expect(tracked.events[0].properties.mode).toBe("standalone");
        Reflect.deleteProperty(navigator, "standalone");
    });

    // The main lever on cost.
    it("sends at most one an hour however often it is called", async () => {
        const { recordUsage } = await loadTelemetry();

        for (let i = 0; i < 20; i++) {
            recordUsage();
            await settle(1);
        }

        expect(tracked.events).toHaveLength(1);
    });

    it("sends again once the hour is up", async () => {
        const { recordUsage } = await loadTelemetry();
        recordUsage();
        await settle(1);

        localStorage.setItem("usage-telemetry-last-sent", String(Date.now() - 61 * 60 * 1000));
        recordUsage();
        await settle(2);

        expect(tracked.events).toHaveLength(2);
    });

    it("says nothing when nobody is signed in", async () => {
        userInfo = null;
        const { recordUsage } = await loadTelemetry();

        recordUsage();
        await settle();

        expect(tracked.events).toHaveLength(0);
    });

    // The first load after an upgrade caches no id yet, so the account arrives after
    // the app has mounted. Without this the event is lost for that whole hour.
    it("reports once the account arrives, not only at mount", async () => {
        userInfo = null;
        const { recordUsage, useUsageTelemetry } = await loadTelemetry();
        void useUsageTelemetry;

        recordUsage();
        await settle();
        expect(tracked.events).toHaveLength(0);

        userInfo = { id: TestUserId, email: TestEmail };
        recordUsage();
        await settle(1);

        expect(tracked.events).toHaveLength(1);
    });
});

describe("the identifier", () => {
    it("is the same person across devices and browsers", async () => {
        const { recordUsage } = await loadTelemetry();
        recordUsage();
        await settle(1);
        const first = tracked.events[0].properties.uid;

        localStorage.clear(); // A different device: no throttle state, same account.
        recordUsage();
        await settle(2);

        expect(tracked.events[1].properties.uid).toBe(first);
    });

    it("differs between people", async () => {
        const { recordUsage } = await loadTelemetry();
        recordUsage();
        await settle(1);

        userInfo = { id: "9f8e7d6c-1234-4abc-9def-000000000002", email: "other@example.org" };
        localStorage.clear();
        recordUsage();
        await settle(2);

        expect(tracked.events[1].properties.uid).not.toBe(tracked.events[0].properties.uid);
    });

    // If this ever fails, the change that made it fail is the one to reconsider.
    it("carries nothing personal", async () => {
        const { recordUsage } = await loadTelemetry();

        recordUsage();
        await settle(1);

        const serialized = JSON.stringify(tracked.events[0]);
        for (const forbidden of [TestUserId, "9f8e7d6c", TestEmail, "example.org"]) {
            expect(serialized).not.toContain(forbidden);
        }
    });
});

describe("update events", () => {
    it("reports the build a device came from and the one it is on", async () => {
        localStorage.setItem("usage-telemetry-last-version", "87981b4");
        const { recordUsage } = await loadTelemetry();

        recordUsage();
        await settle(2);

        const updated = tracked.events.find(e => e.name === "updated");
        expect(updated).toBeDefined();
        expect(updated!.properties.from).toBe("87981b4");
        expect(updated!.properties.to).toBe("b61a547");
    });

    // A device that has never been here has not updated; it has arrived.
    it("says nothing on a first ever run", async () => {
        const { recordUsage } = await loadTelemetry();

        recordUsage();
        await settle(1);

        expect(tracked.events.find(e => e.name === "updated")).toBeUndefined();
    });

    // Throttled by how often we deploy, which is not the user's business — so the
    // hourly gate on usage must not suppress it.
    it("is not held back by the usage throttle", async () => {
        localStorage.setItem("usage-telemetry-last-sent", String(Date.now()));
        localStorage.setItem("usage-telemetry-last-version", "87981b4");
        const { recordUsage } = await loadTelemetry();

        recordUsage();
        await settle(1);

        expect(tracked.events.map(e => e.name)).toEqual(["updated"]);
    });

    it("does not repeat once the new build is recorded", async () => {
        localStorage.setItem("usage-telemetry-last-version", "87981b4");
        const { recordUsage } = await loadTelemetry();
        recordUsage();
        await settle(2);

        recordUsage();
        await settle();

        expect(tracked.events.filter(e => e.name === "updated")).toHaveLength(1);
    });
});

describe("exceptions", () => {
    const boom = (message = "boom") => {
        const error = new Error(message);
        error.stack = `Error: ${message}\n    at somewhere (app.js:1:1)\n    at caller (app.js:2:2)`;
        return error;
    };

    it("reports a failure with where it came from", async () => {
        const { recordException } = await loadTelemetry();

        recordException(boom(), "render");
        await settle(0, 1);

        expect(tracked.exceptions).toHaveLength(1);
        expect(tracked.exceptions[0].properties.where).toBe("render");
        expect(tracked.exceptions[0].properties.count).toBe(1);
    });

    // A render loop throws thousands of times a second. Reporting each would be
    // ruinous; reporting one and hiding the rest would lose the only fact that
    // matters about it.
    it("reports a repeating failure once, and says how often it happened", async () => {
        const { recordException } = await loadTelemetry();

        for (let i = 0; i < 500; i++) recordException(boom(), "render");
        await settle(0, 1);

        expect(tracked.exceptions).toHaveLength(1);
        expect(tracked.exceptions[0].properties.count).toBe(1);
    });

    it("tells distinct failures apart", async () => {
        const { recordException } = await loadTelemetry();

        recordException(boom("first"), "render");
        recordException(boom("second"), "render");
        await settle(0, 2);

        expect(tracked.exceptions).toHaveLength(2);
    });

    // A page failing in many different ways must not clear the identity gate over
    // and over.
    it("caps how many distinct failures it reports in an hour", async () => {
        const { recordException } = await loadTelemetry();

        for (let i = 0; i < 10; i++) recordException(boom(`failure ${i}`), "render");
        await settle(0, 3);

        expect(tracked.exceptions.length).toBeLessThanOrEqual(3);
    });

    // A crash on the login screen is precisely the one nobody would otherwise hear
    // about, so it is reported even with nobody to attribute it to.
    it("reports a crash even when nobody is signed in", async () => {
        userInfo = null;
        const { recordException } = await loadTelemetry();

        recordException(boom(), "render");
        await settle(0, 1);

        expect(tracked.exceptions).toHaveLength(1);
        expect(tracked.exceptions[0].properties.uid).toBeUndefined();
    });

    it("bounds the message and the stack it sends", async () => {
        const { recordException } = await loadTelemetry();
        const huge = new Error("x".repeat(5000));
        huge.stack = Array.from({ length: 100 }, (_, i) => `    at frame${i} (app.js:${i}:1)`).join("\n");

        recordException(huge, "render");
        await settle(0, 1);

        expect(tracked.exceptions[0].exception.message.length).toBeLessThanOrEqual(200);
        expect(tracked.exceptions[0].exception.stack!.split("\n").length).toBeLessThanOrEqual(6);
    });

    // Reporting a crash must never become a second crash.
    it("never throws, whatever it is handed", async () => {
        const { recordException } = await loadTelemetry();

        expect(() => recordException(undefined, "render")).not.toThrow();
        expect(() => recordException("a string", "render")).not.toThrow();
        expect(() => recordException({ odd: true }, "render")).not.toThrow();
    });
});

describe("the allow-list", () => {
    it("drops anything this module did not produce", async () => {
        await loadTelemetry();
        // Force construction of the client so the initializer is registered.
        const { recordUsage } = await import("./telemetry");
        recordUsage();
        await settle(1);

        expect(tracked.initializers).not.toHaveLength(0);
        const autoCollected = { baseType: "PageviewData", baseData: { name: "/dojo", properties: {} } };
        expect(tracked.initializers.every(fn => fn(autoCollected))).toBe(false);
    });

    // The marker gates what is sent without ever being sent itself — an extra
    // property on every event is exactly the overhead this file exists to avoid.
    it("does not let its own marker reach the wire", async () => {
        const { recordUsage } = await loadTelemetry();

        recordUsage();
        await settle(1);

        expect(JSON.stringify(tracked.events[0])).not.toContain("__explicit");
    });

    // The SDK attaches these regardless of configuration, and they were found
    // arriving in the workspace: the page path, and an IP that ingestion uses to
    // look up a city before masking it. Both are stripped on the way out, and the
    // privacy policy says they are — so this is what keeps that sentence true.
    it("strips the page path and declines the location lookup", async () => {
        const { recordUsage } = await loadTelemetry();
        recordUsage();
        await settle(1);

        const tags: Record<string, unknown> = {
            "ai.operation.name": "/settings",
            "ai.location.ip": "203.0.113.7",
            "ai.user.id": "4AqGxUs2eT6o1tdN6FDT",
            "ai.session.id": "9e+/LT4jtQbBTGCv",
        };
        admit({ name: "usage", properties: { __explicit: true } }, "EventData", tags);

        expect(tags["ai.operation.name"]).toBe("");
        expect(tags["ai.location.ip"]).toBe("0.0.0.0");
        expect(tags["ai.user.id"]).toBe("");
        expect(tags["ai.session.id"]).toBe("");
    });
});

describe("without a connection string", () => {
    it("constructs nothing and sends nothing", async () => {
        const { recordUsage, recordException } = await loadTelemetry("");

        recordUsage();
        recordException(new Error("boom"), "render");
        await settle();

        expect(loadCalls).toBe(0);
        expect(tracked.events).toHaveLength(0);
        expect(tracked.exceptions).toHaveLength(0);
    });
});
