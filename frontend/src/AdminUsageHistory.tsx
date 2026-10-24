import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Form, Table } from "react-bootstrap";
import { TranslatorContext, type Language } from "./i18n";
import { AdminRequestError, type HistoryEntry, type PublicBranch } from "./sync/backend";
import { assignColorSlots, buildUsageSeries, type UsageGroup, type UsageGrouping, type UsageLabels } from "./usageSeries";
import { cachedUsageHistory, historyWeeks, lifetimesOf, loadUsageHistory, sumValues, weeksAsReport } from "./usageHistory";
import Loading from "./components/Loading";
import RefreshState from "./components/RefreshState";
import UsageChart from "./components/UsageChart";

const WSKO = "WSKO";

// How many weeks back to show; 0 is all of it.
const RangeChoices = [12, 26, 52, 0] as const;
type Range = typeof RangeChoices[number];

const localeOf = (lang: Language): string =>
  ({ sv: "sv-SE", en: "en-GB", tr: "tr-TR", ja: "ja-JP" })[lang];

// The long view: finished weeks as the snapshot job stored them, and what
// happened to the membership in each. Everything here is anonymous counts.
const AdminUsageHistory = () => {
  const translator = useContext(TranslatorContext);
  const locale = localeOf(translator.currentLanguage);

  // What this browser already holds is drawn at once; the refresh below tops it
  // up with whatever was recorded since.
  const [cached] = useState(cachedUsageHistory);
  const [items, setItems] = useState<HistoryEntry[] | null>(cached?.items ?? null);
  const [branches, setBranches] = useState<PublicBranch[]>(cached?.branches ?? []);
  const [error, setError] = useState<"unconfigured" | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<Range>(26);
  const [grouping, setGrouping] = useState<UsageGrouping>("none");

  // One memory for both charts, so a branch wears the same color in each.
  const colorMemory = useRef(new Map<string, number>());

  useEffect(() => {
    let live = true;
    setError(null);
    setRefreshing(true);
    void (async () => {
      try {
        const loaded = await loadUsageHistory();
        if (!live) return;
        setItems(loaded.items);
        setBranches(loaded.branches);
      } catch (err) {
        if (live) setError(err instanceof AdminRequestError && err.status === 503 ? "unconfigured" : "failed");
      } finally {
        if (live) setRefreshing(false);
      }
    })();
    return () => { live = false; };
  }, [attempt]);

  const allRows = useMemo(() => items === null ? [] : historyWeeks(items), [items]);
  const rows = range === 0 ? allRows : allRows.slice(-range);
  const firstInRange = rows[0]?.start ?? "";
  const itemsInRange = useMemo(() => (items ?? []).filter(e => e.type !== "week" && e.at >= firstInRange), [items, firstInRange]);

  const labels: UsageLabels = {
    all: translator.translate("Aktiva personer"),
    noBranch: translator.translate("Ingen klubb"),
    deleted: translator.translate("Borttagen klubb"),
    other: translator.translate("Övriga"),
    wsko: WSKO,
  };
  const membersLabels: UsageLabels = { ...labels, all: translator.translate("Medlemmar") };

  const active = useMemo(() => buildUsageSeries(
    weeksAsReport(rows, w => ({ total: w.people, byBranch: w.byBranch }), branches), grouping, labels,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [rows, branches, grouping, translator]);
  const members = useMemo(() => buildUsageSeries(
    weeksAsReport(rows, w => ({ total: sumValues(w.members), byBranch: w.members }), branches), grouping, membersLabels,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [rows, branches, grouping, translator]);

  const slots = useMemo(() => {
    // Both charts' groups through one assignment, so neither takes a slot the
    // other is using.
    const seen = new Map<string, UsageGroup>();
    for (const g of [...active.groups, ...members.groups]) seen.set(g.key, g);
    return assignColorSlots([...seen.values()], colorMemory.current);
  }, [active, members]);
  const colorOf = (group: UsageGroup) =>
    group.kind === "other" ? "var(--usage-other)" : `var(--usage-series-${slots.get(group.key) ?? 1})`;

  const shortDate = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }), [locale]);
  const shortLabel = (start: string) => shortDate.format(new Date(start));
  const weekLabel = (start: string) => {
    const from = new Date(start);
    return shortDate.formatRange(from, new Date(from.getTime() + 6 * 24 * 60 * 60 * 1000));
  };

  if (error === "unconfigured") {
    return <p>{translator.translate("Användningsstatistiken är inte påslagen i den här miljön.")}</p>;
  }
  // As on the live view: only a failure with nothing to show takes the page.
  if (error === "failed" && items === null) {
    return (
      <div>
        <p className="text-danger">{translator.translate("Kunde inte hämta historiken.")}</p>
        <Button variant="outline-secondary" onClick={() => setAttempt(n => n + 1)}>{translator.translate("Försök igen")}</Button>
      </div>
    );
  }
  if (items === null) return <Loading />;
  if (allRows.length === 0) {
    return <p className="text-body-secondary">{translator.translate("Ingen historik ännu. Varje vecka sparas när den är slut.")}</p>;
  }

  const latest = [...rows].reverse().find(r => r.week !== null)?.week ?? null;
  const memberCount = latest ? sumValues(latest.members) : 0;
  const share = (part: number, whole: number) =>
    whole > 0 ? (part / whole).toLocaleString(locale, { style: "percent", maximumFractionDigits: 0 }) : "–";
  const totals = rows.reduce((t, r) => ({
    applications: t.applications + r.applications, approved: t.approved + r.approved,
    declined: t.declined + r.declined, withdrawn: t.withdrawn + r.withdrawn,
    created: t.created + r.created, createdViaAdmin: t.createdViaAdmin + r.createdViaAdmin,
    deleted: t.deleted + r.deleted, moves: t.moves + r.moves,
  }), { applications: 0, approved: 0, declined: 0, withdrawn: 0, created: 0, createdViaAdmin: 0, deleted: 0, moves: 0 });
  const lifetimes = lifetimesOf(itemsInRange);
  const lifetimeLabels: Array<[string, string]> = [
    ["<1m", translator.translate("Kortare än en månad")],
    ["1-6m", translator.translate("1–6 månader")],
    ["6-12m", translator.translate("6–12 månader")],
    ["1-2y", translator.translate("1–2 år")],
    ["2y+", translator.translate("Mer än 2 år")],
    ["unknown", translator.translate("Okänt")],
  ];
  const rangeLabel = (n: Range) => ({
    12: translator.translate("Senaste 12 veckorna"),
    26: translator.translate("Senaste 26 veckorna"),
    52: translator.translate("Senaste 52 veckorna"),
    0: translator.translate("Hela historiken"),
  })[n];

  const chart = (title: string, series: typeof active, ariaLabel: string) => (
    <div className="mb-4">
      <h2 className="h6">{title}</h2>
      {series.groups.length > 1 && (
        <div className="usage-legend mb-2">
          {series.groups.map(g => (
            <span key={g.key}><span className="usage-chart-swatch" style={{ background: colorOf(g) }} />{g.label}</span>
          ))}
        </div>
      )}
      <UsageChart groups={series.groups} columns={series.columns} colorOf={colorOf}
                  shortLabel={shortLabel} longLabel={weekLabel}
                  totalLabel={translator.translate("Totalt")} ariaLabel={ariaLabel} />
    </div>
  );

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <Form.Select size="sm" className="w-auto" value={range} aria-label={translator.translate("Period")}
                     onChange={e => setRange(Number(e.target.value) as Range)}>
          {RangeChoices.map(n => <option key={n} value={n}>{rangeLabel(n)}</option>)}
        </Form.Select>
        <Form.Select size="sm" className="w-auto" value={grouping} aria-label={translator.translate("Gruppering")}
                     onChange={e => setGrouping(e.target.value as UsageGrouping)}>
          <option value="none">{translator.translate("Alla tillsammans")}</option>
          <option value="branch">{translator.translate("Per klubb")}</option>
          <option value="federation">{translator.translate("Per förbund")}</option>
        </Form.Select>
        <RefreshState refreshing={refreshing} failed={error === "failed"} onRetry={() => setAttempt(n => n + 1)} />
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Card className="flex-fill"><Card.Body className="py-2">
          <div className="small text-body-secondary">{translator.translate("Medlemmar")}</div>
          <div className="fs-3 fw-semibold">{memberCount}</div>
        </Card.Body></Card>
        <Card className="flex-fill"><Card.Body className="py-2">
          <div className="small text-body-secondary">{translator.translate("Aktiva senaste veckan")}</div>
          <div className="fs-3 fw-semibold">{latest?.people ?? 0}</div>
          <div className="small text-body-secondary">{share(latest?.people ?? 0, memberCount)} {translator.translate("av medlemmarna")}</div>
        </Card.Body></Card>
        <Card className="flex-fill"><Card.Body className="py-2">
          <div className="small text-body-secondary">{translator.translate("Installerad på hemskärmen")}</div>
          <div className="fs-3 fw-semibold">{share(latest?.byMode.standalone ?? 0, latest?.people ?? 0)}</div>
        </Card.Body></Card>
        <Card className="flex-fill"><Card.Body className="py-2">
          <div className="small text-body-secondary">{translator.translate("Nya konton")}</div>
          <div className="fs-3 fw-semibold">{totals.created}</div>
        </Card.Body></Card>
        <Card className="flex-fill"><Card.Body className="py-2">
          <div className="small text-body-secondary">{translator.translate("Avslutade konton")}</div>
          <div className="fs-3 fw-semibold">{totals.deleted}</div>
        </Card.Body></Card>
      </div>

      {chart(translator.translate("Aktiva personer per vecka"), active, translator.translate("Aktiva personer per vecka"))}
      {chart(translator.translate("Medlemmar per vecka"), members, translator.translate("Medlemmar per vecka"))}

      <div className="row g-3">
        <div className="col-md-6">
          <h2 className="h6">{translator.translate("Under perioden")}</h2>
          <Table size="sm" className="usage-table">
            <tbody>
              <tr><td>{translator.translate("Ansökningar")}</td><td className="text-end">{totals.applications}</td></tr>
              <tr><td className="ps-3">{translator.translate("Godkända")}</td><td className="text-end">{totals.approved}</td></tr>
              <tr><td className="ps-3">{translator.translate("Avslagna")}</td><td className="text-end">{totals.declined}</td></tr>
              <tr><td className="ps-3">{translator.translate("Återtagna")}</td><td className="text-end">{totals.withdrawn}</td></tr>
              <tr><td>{translator.translate("Nya konton")}</td><td className="text-end">{totals.created}</td></tr>
              <tr><td className="ps-3">{translator.translate("Tillagda av en administratör")}</td><td className="text-end">{totals.createdViaAdmin}</td></tr>
              <tr><td>{translator.translate("Avslutade konton")}</td><td className="text-end">{totals.deleted}</td></tr>
              <tr><td>{translator.translate("Byten av klubb")}</td><td className="text-end">{totals.moves}</td></tr>
            </tbody>
          </Table>
        </div>
        <div className="col-md-6">
          <h2 className="h6">{translator.translate("Avslutade konton efter hur länge de fanns")}</h2>
          <Table size="sm" className="usage-table">
            <tbody>
              {lifetimeLabels.filter(([key]) => key !== "unknown" || lifetimes.has("unknown")).map(([key, label]) => (
                <tr key={key}><td>{label}</td><td className="text-end">{lifetimes.get(key) ?? 0}</td></tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>

      <details className="mt-2">
        <summary>{translator.translate("Visa siffrorna")}</summary>
        <div className="table-responsive">
          <Table size="sm" className="usage-table mt-2">
            <thead>
              <tr>
                <th>{translator.translate("Vecka")}</th>
                <th className="text-end">{translator.translate("Aktiva")}</th>
                <th className="text-end">{translator.translate("Timmar")}</th>
                <th className="text-end">{translator.translate("Medlemmar")}</th>
                <th className="text-end">{translator.translate("Nya")}</th>
                <th className="text-end">{translator.translate("Avslutade")}</th>
                <th className="text-end">{translator.translate("Byten")}</th>
                <th className="text-end">{translator.translate("Ansökningar")}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map(r => (
                <tr key={r.start}>
                  <td>{weekLabel(r.start)}</td>
                  <td className="text-end">{r.week?.people ?? "–"}</td>
                  <td className="text-end">{r.week?.hours ?? "–"}</td>
                  <td className="text-end">{r.week ? sumValues(r.week.members) : "–"}</td>
                  <td className="text-end">{r.created}</td>
                  <td className="text-end">{r.deleted}</td>
                  <td className="text-end">{r.moves}</td>
                  <td className="text-end">{r.applications}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </details>
    </div>
  );
};

export default AdminUsageHistory;
