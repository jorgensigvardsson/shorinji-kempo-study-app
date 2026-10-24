import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, ButtonGroup, Card, Form, Table, ToggleButton } from "react-bootstrap";
import { TranslatorContext, type Language } from "./i18n";
import { getSyncManager } from "./sync/manager";
import { AdminRequestError, type UsageBin, type UsageReport } from "./sync/backend";
import { assignColorSlots, buildUsageSeries, type UsageGroup, type UsageGrouping } from "./usageSeries";
import Loading from "./components/Loading";
import UsageChart from "./components/UsageChart";

// The label for branches that belong to no federation. WSKO is the root of the
// organization rather than a record with a name, so the label is the frontend's
// to supply — the same constant the branch pickers use.
const WSKO = "WSKO";

// Telemetry is kept for 30 days, so a longer window would draw mostly nothing
// and read as a collapse in use. The server accepts more, for the day retention
// is raised; the choices here are what there is data for.
const PeriodChoices = [7, 14, 30] as const;

const localeOf = (lang: Language): string =>
  ({ sv: "sv-SE", en: "en-GB", tr: "tr-TR", ja: "ja-JP" })[lang];

// The technical admin's view of how many people use the app, over time and per
// branch or federation. Counts only: who they were never leaves Azure.
const AdminUsage = () => {
  const translator = useContext(TranslatorContext);
  const locale = localeOf(translator.currentLanguage);

  const [days, setDays] = useState<number>(30);
  const [bin, setBin] = useState<UsageBin>("day");
  const [grouping, setGrouping] = useState<UsageGrouping>("none");
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<"unconfigured" | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Palette slots per group, kept for as long as the page is open, so a branch
  // keeps its color when the period or grouping changes what else is on screen.
  const colorMemory = useRef(new Map<string, number>());

  useEffect(() => {
    let live = true;
    setError(null);
    void (async () => {
      try {
        const fetched = await getSyncManager().adminUsage(days, bin);
        if (live) setReport(fetched);
      } catch (err) {
        if (!live) return;
        setError(err instanceof AdminRequestError && err.status === 503 ? "unconfigured" : "failed");
      }
    })();
    return () => { live = false; };
  }, [days, bin, attempt]);

  const series = useMemo(() => report === null ? null : buildUsageSeries(report, grouping, {
    all: translator.translate("Aktiva personer"),
    noBranch: translator.translate("Ingen klubb"),
    deleted: translator.translate("Borttagen klubb"),
    other: translator.translate("Övriga"),
    wsko: WSKO,
  }), [report, grouping, translator]);

  const slots = useMemo(() => series === null ? new Map<string, number>() : assignColorSlots(series.groups, colorMemory.current), [series]);
  const colorOf = (group: UsageGroup) =>
    group.kind === "other" ? "var(--usage-other)" : `var(--usage-series-${slots.get(group.key) ?? 1})`;

  // Bucket starts are UTC midnights, so they are formatted in UTC: in local time
  // west of Greenwich every bar would be labelled with the day before.
  const shortDate = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }), [locale]);
  const longDate = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }), [locale]);
  // Spelled out rather than built from the number, so each is a key the
  // translation files can be checked against.
  const periodLabel = (n: typeof PeriodChoices[number]) => ({
    7: translator.translate("Senaste 7 dagarna"),
    14: translator.translate("Senaste 14 dagarna"),
    30: translator.translate("Senaste 30 dagarna"),
  })[n];

  const shortLabel = (start: string) => shortDate.format(new Date(start));
  const longLabel = (start: string) => {
    const from = new Date(start);
    if (bin === "day") return longDate.format(from);
    const to = new Date(from.getTime() + 6 * 24 * 60 * 60 * 1000);
    return shortDate.formatRange(from, to);
  };

  const header = (
    <>
      <h1 className="h4">{translator.translate("Användningsstatistik")}</h1>
      <p className="text-body-secondary small">
        {translator.translate("Hur många som har använt appen. Det räknas i personer: samma person på flera enheter räknas en gång.")}
      </p>
    </>
  );

  if (error === "unconfigured") {
    return (
      <div>
        {header}
        <p>{translator.translate("Användningsstatistiken är inte påslagen i den här miljön.")}</p>
      </div>
    );
  }
  if (error === "failed") {
    return (
      <div>
        {header}
        <p className="text-danger">{translator.translate("Kunde inte hämta användningsstatistiken.")}</p>
        <Button variant="outline-secondary" onClick={() => setAttempt(n => n + 1)}>{translator.translate("Försök igen")}</Button>
      </div>
    );
  }
  if (report === null || series === null) {
    return <div>{header}<Loading /></div>;
  }

  const perBucket = series.columns.map(c => c.people);
  const average = perBucket.length > 0 ? perBucket.reduce((a, b) => a + b, 0) / perBucket.length : 0;
  const peak = Math.max(0, ...perBucket);
  const grouped = grouping !== "none";

  return (
    <div>
      {header}
      {report.demo === true && (
        <p><Badge bg="warning" text="dark">{translator.translate("Påhittade siffror från utvecklingsmiljön")}</Badge></p>
      )}

      {/* Every control in one row above the chart, so what the chart shows is
          read in one place. */}
      <div className="d-flex flex-wrap gap-2 mb-3">
        <Form.Select size="sm" className="w-auto" value={days} aria-label={translator.translate("Period")}
                     onChange={e => setDays(Number(e.target.value))}>
          {PeriodChoices.map(n => (
            <option key={n} value={n}>{periodLabel(n)}</option>
          ))}
        </Form.Select>
        <ButtonGroup size="sm">
          {(["day", "week"] as const).map(value => (
            <ToggleButton key={value} id={`usage-bin-${value}`} type="radio" name="usage-bin" variant="outline-secondary"
                          value={value} checked={bin === value} onChange={() => setBin(value)}>
              {value === "day" ? translator.translate("Per dag") : translator.translate("Per vecka")}
            </ToggleButton>
          ))}
        </ButtonGroup>
        <Form.Select size="sm" className="w-auto" value={grouping} aria-label={translator.translate("Gruppering")}
                     onChange={e => setGrouping(e.target.value as UsageGrouping)}>
          <option value="none">{translator.translate("Alla tillsammans")}</option>
          <option value="branch">{translator.translate("Per klubb")}</option>
          <option value="federation">{translator.translate("Per förbund")}</option>
        </Form.Select>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Card className="flex-fill"><Card.Body className="py-2">
          <div className="small text-body-secondary">{translator.translate("Aktiva personer")}</div>
          <div className="fs-3 fw-semibold">{report.people}</div>
        </Card.Body></Card>
        <Card className="flex-fill"><Card.Body className="py-2">
          <div className="small text-body-secondary">
            {bin === "day" ? translator.translate("Snitt per dag") : translator.translate("Snitt per vecka")}
          </div>
          <div className="fs-3 fw-semibold">{average.toLocaleString(locale, { maximumFractionDigits: 1 })}</div>
        </Card.Body></Card>
        <Card className="flex-fill"><Card.Body className="py-2">
          <div className="small text-body-secondary">
            {bin === "day" ? translator.translate("Flest på en dag") : translator.translate("Flest på en vecka")}
          </div>
          <div className="fs-3 fw-semibold">{peak}</div>
        </Card.Body></Card>
      </div>

      {/* A legend whenever there is more than one series. One series needs none:
          the chart is the active people, which the tiles above already say. */}
      {series.groups.length > 1 && (
        <div className="usage-legend mb-2">
          {series.groups.map(g => (
            <span key={g.key}>
              <span className="usage-chart-swatch" style={{ background: colorOf(g) }} />{g.label}
            </span>
          ))}
        </div>
      )}

      <UsageChart
        groups={series.groups}
        columns={series.columns}
        colorOf={colorOf}
        shortLabel={shortLabel}
        longLabel={longLabel}
        totalLabel={translator.translate("Totalt")}
        ariaLabel={bin === "day" ? translator.translate("Aktiva personer per dag") : translator.translate("Aktiva personer per vecka")}
      />

      {grouped && (
        <Table size="sm" className="usage-table mt-3">
          <thead>
            <tr>
              <th>{grouping === "branch" ? translator.translate("Klubb") : translator.translate("Förbund")}</th>
              <th className="text-end">{translator.translate("Personer")}</th>
            </tr>
          </thead>
          <tbody>
            {series.groups.map((g, i) => (
              <tr key={g.key}>
                <td><span className="usage-chart-swatch" style={{ background: colorOf(g) }} />{g.label}</td>
                <td className="text-end">{series.totals[i]}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>{translator.translate("Totalt")}</th>
              <th className="text-end">{report.people}</th>
            </tr>
          </tfoot>
        </Table>
      )}
      {grouped && (
        <p className="text-body-secondary small">
          {translator.translate("I totalen räknas varje person en gång. Den som har bytt klubb under perioden finns med i båda klubbarna.")}
        </p>
      )}

      {/* The chart's numbers as a table: the exact values, and the way to read
          the chart without telling its colors apart. */}
      <details className="mt-3">
        <summary>{translator.translate("Visa siffrorna")}</summary>
        <div className="table-responsive">
          <Table size="sm" className="usage-table mt-2">
            <thead>
              <tr>
                <th>{bin === "day" ? translator.translate("Dag") : translator.translate("Vecka")}</th>
                <th className="text-end">{translator.translate("Totalt")}</th>
                {grouped && series.groups.map(g => <th key={g.key} className="text-end">{g.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {series.columns.map(c => (
                <tr key={c.start}>
                  <td>{longLabel(c.start)}</td>
                  <td className="text-end">{c.people}</td>
                  {grouped && c.values.map((v, i) => <td key={series.groups[i].key} className="text-end">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </details>
    </div>
  );
};

export default AdminUsage;
