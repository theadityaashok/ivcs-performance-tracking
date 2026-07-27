"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RecordItem = {
  region: string;
  district: string;
  block: string;
  ivcs: string;
  registrations: number;
  target: number;
  listed: boolean;
};

type ApiPayload = {
  records: RecordItem[];
  updatedAt: string;
  stale?: boolean;
  error?: string;
};

type PerformanceRow = {
  name: string;
  registrations: number;
  target: number;
  units: number;
  district?: string;
  block?: string;
};

const clean = (value?: string) => value?.trim() || "Not specified";
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function aggregate(rows: RecordItem[], key: (row: RecordItem) => string) {
  const totals = new Map<string, PerformanceRow>();
  rows.forEach((row) => {
    const name = key(row);
    const current = totals.get(name) || {
      name,
      registrations: 0,
      target: 0,
      units: 0,
    };
    current.registrations += row.registrations;
    current.target += row.target;
    current.units += 1;
    totals.set(name, current);
  });
  return [...totals.values()].sort(
    (a, b) => b.registrations - a.registrations,
  );
}

const percentage = (achievement: number, target: number) =>
  target > 0 ? (achievement / target) * 100 : 0;

function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number | string;
  note: string;
  tone: string;
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`} aria-hidden="true">
        <span />
      </div>
      <div>
        <p>{label}</p>
        <strong>
          {typeof value === "number" ? value.toLocaleString("en-IN") : value}
        </strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function RegionCard({ row }: { row: PerformanceRow }) {
  const progress = percentage(row.registrations, row.target);
  const gauge = Math.min(progress, 100);
  const chartBars = [0.44, 0.62, 0.54, 0.78, 0.68, 0.92].map(
    (factor) => Math.max(12, Math.min(100, gauge * factor)),
  );
  return (
    <article className="region-card">
      <div className="region-heading">
        <div>
          <span>Region</span>
          <h3>{row.name}</h3>
        </div>
        <div
          className="region-gauge"
          style={{ "--progress": `${gauge}%` } as React.CSSProperties}
          aria-label={`${progress.toFixed(1)} percent achieved`}
        >
          <strong>{progress.toFixed(1)}%</strong>
        </div>
      </div>
      <div className="region-chart-wrap">
        <div className="region-mini-chart" aria-hidden="true">
          {chartBars.map((height, index) => (
            <span
              key={index}
              style={{ "--bar": `${height}%` } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="region-progress">
          <i style={{ width: `${gauge}%` }} />
        </div>
      </div>
      <dl>
        <div>
          <dt>Achievement</dt>
          <dd>{row.registrations.toLocaleString("en-IN")}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{row.target.toLocaleString("en-IN")}</dd>
        </div>
        <div>
          <dt>Gap</dt>
          <dd>{Math.max(row.target - row.registrations, 0).toLocaleString("en-IN")}</dd>
        </div>
      </dl>
    </article>
  );
}

export default function Home() {
  const [data, setData] = useState<ApiPayload>({ records: [], updatedAt: "" });
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState("All regions");
  const [district, setDistrict] = useState("All districts");
  const [block, setBlock] = useState("All blocks");
  const [ivcs, setIvcs] = useState("All IVCS");
  const [status, setStatus] = useState("All status");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"district" | "block" | "ivcs">("district");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/ivcs", { cache: "no-store" });
      const payload = (await response.json()) as ApiPayload;
      setData(payload);
    } catch {
      setData((previous) => ({
        ...previous,
        stale: true,
        error: "Unable to refresh live registrations",
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const regions = useMemo(
    () => [...new Set(data.records.map((row) => row.region))].sort(),
    [data.records],
  );
  const districts = useMemo(
    () =>
      [
        ...new Set(
          data.records
            .filter((row) => region === "All regions" || row.region === region)
            .map((row) => clean(row.district)),
        ),
      ].sort(),
    [data.records, region],
  );
  const blocks = useMemo(
    () =>
      [
        ...new Set(
          data.records
            .filter(
              (row) =>
                (region === "All regions" || row.region === region) &&
                (district === "All districts" ||
                  clean(row.district) === district),
            )
            .map((row) => clean(row.block)),
        ),
      ].sort(),
    [data.records, region, district],
  );
  const ivcsOptions = useMemo(
    () =>
      [
        ...new Set(
          data.records
            .filter(
              (row) =>
                (region === "All regions" || row.region === region) &&
                (district === "All districts" ||
                  clean(row.district) === district) &&
                (block === "All blocks" || clean(row.block) === block),
            )
            .map((row) => clean(row.ivcs)),
        ),
      ].sort(),
    [data.records, region, district, block],
  );

  const filtered = useMemo(
    () =>
      data.records.filter(
        (row) =>
          (region === "All regions" || row.region === region) &&
          (district === "All districts" || clean(row.district) === district) &&
          (block === "All blocks" || clean(row.block) === block) &&
          (ivcs === "All IVCS" || clean(row.ivcs) === ivcs) &&
          (status === "All status" ||
            (status === "Not started"
              ? row.registrations === 0
              : row.registrations > 0)),
      ),
    [data.records, region, district, block, ivcs, status],
  );

  const districtRows = useMemo(
    () => aggregate(filtered, (row) => row.district),
    [filtered],
  );
  const blockRows = useMemo(
    () => aggregate(filtered, (row) => row.block),
    [filtered],
  );
  const ivcsRows = useMemo(
    () =>
      aggregate(filtered, (row) => row.ivcs).map((item) => {
        const matches = filtered.filter((row) => row.ivcs === item.name);
        return {
          ...item,
          district: [...new Set(matches.map((row) => row.district))].join(", "),
          block: [...new Set(matches.map((row) => row.block))].join(", "),
        };
      }),
    [filtered],
  );
  const regionRows = useMemo(
    () => aggregate(data.records, (row) => row.region),
    [data.records],
  );

  const activeRows =
    view === "district" ? districtRows : view === "block" ? blockRows : ivcsRows;
  const visibleRows = activeRows.filter((row) =>
    row.name.toLowerCase().includes(query.toLowerCase()),
  );

  const achievement = filtered.reduce(
    (sum, row) => sum + row.registrations,
    0,
  );
  const target = filtered.reduce((sum, row) => sum + row.target, 0);
  const gap = Math.max(target - achievement, 0);
  const overallProgress = percentage(achievement, target);
  const activeIvcs = filtered.filter((row) => row.registrations > 0).length;
  const notStartedIvcs = filtered.filter(
    (row) => row.listed && row.registrations === 0,
  ).length;

  function resetFilters() {
    setRegion("All regions");
    setDistrict("All districts");
    setBlock("All blocks");
    setIvcs("All IVCS");
    setStatus("All status");
  }

  function downloadCsv() {
    const heading = `${view},achievement,target,gap,progress\n`;
    const rows = visibleRows
      .map((row) => {
        const progress = percentage(row.registrations, row.target);
        return `"${row.name.replaceAll('"', '""')}",${row.registrations},${row.target},${Math.max(row.target - row.registrations, 0)},${progress.toFixed(1)}%`;
      })
      .join("\n");
    const blob = new Blob([heading + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ivcs-${view}-target-performance.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">M</div>
        <div className="brand-copy">
          <strong>Government of Meghalaya</strong>
          <span>Cooperative Registration Tracking</span>
        </div>
        <div className="live-wrap">
          <span className={`live-dot ${data.stale ? "offline" : ""}`} />
          {data.stale ? "Targets loaded • API unavailable" : "Live API data"}
        </div>
        <button className="refresh-button" onClick={refresh} disabled={loading}>
          <span aria-hidden="true">↻</span> {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <section className="hero compact-hero">
        <div className="hero-orb hero-orb-one" aria-hidden="true" />
        <div className="hero-orb hero-orb-two" aria-hidden="true" />
        <div>
          <p className="eyebrow">Integrated Village Cooperative Societies</p>
          <h1>Cooperative Registration Tracking</h1>
          <p className="hero-copy">
            Live registration performance across regions, districts, blocks
            and individual IVCS in Meghalaya.
          </p>
        </div>
        <div className="updated">
          <span>Last updated</span>
          <strong>
            {data.updatedAt
              ? new Date(data.updatedAt).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Waiting for data"}
          </strong>
          <small>Refreshes 4 times daily or on demand</small>
        </div>
      </section>

      <section className="filters target-filters" aria-label="Dashboard filters">
        <label>
          Region
          <select
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              setDistrict("All districts");
              setBlock("All blocks");
              setIvcs("All IVCS");
            }}
          >
            <option>All regions</option>
            {regions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          District
          <select
            value={district}
            onChange={(event) => {
              setDistrict(event.target.value);
              setBlock("All blocks");
              setIvcs("All IVCS");
            }}
          >
            <option>All districts</option>
            {districts.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Block
          <select
            value={block}
            onChange={(event) => {
              setBlock(event.target.value);
              setIvcs("All IVCS");
            }}
          >
            <option>All blocks</option>
            {blocks.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          IVCS
          <select value={ivcs} onChange={(event) => setIvcs(event.target.value)}>
            <option>All IVCS</option>
            {ivcsOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Registration status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option>All status</option>
            <option>Started</option>
            <option>Not started</option>
          </select>
        </label>
        <button className="clear-button" onClick={resetFilters}>Clear</button>
      </section>

      {data.stale && (
        <div className="error-banner" role="status">
          Targets are available, but live registrations could not be refreshed.
          The dashboard will retry automatically.
        </div>
      )}

      <section className="stats target-stats">
        <StatCard label="Registrations" value={achievement} note={`${activeIvcs} IVCS reporting`} tone="green" />
        <StatCard label="Target" value={target} note="From target workbook" tone="blue" />
        <StatCard label="Remaining gap" value={gap} note="Target less registrations" tone="amber" />
        <StatCard label="Achievement" value={`${overallProgress.toFixed(1)}%`} note="Overall completion" tone="violet" />
        <StatCard label="Not started" value={notStartedIvcs} note="IVCS with zero registrations" tone="red" />
      </section>

      {notStartedIvcs > 0 && status !== "Not started" && (
        <button
          className="not-started-callout"
          onClick={() => {
            setStatus("Not started");
            setView("ivcs");
            setQuery("");
          }}
        >
          <span className="alert-symbol" aria-hidden="true">!</span>
          <span>
            <strong>{notStartedIvcs.toLocaleString("en-IN")} IVCS have not started registration</strong>
            <small>Review the zero-registration societies requiring immediate follow-up.</small>
          </span>
          <b>View Not Started →</b>
        </button>
      )}

      {region === "All regions" && district === "All districts" && (
        <section className="region-section">
          <div className="region-title">
            <div>
              <p className="section-label">Regional performance</p>
              <h2>Progress across Meghalaya&apos;s three regions</h2>
            </div>
            <span>{data.records.length} IVCS in target plan</span>
          </div>
          <div className="region-grid">
            {regionRows.map((row) => <RegionCard key={row.name} row={row} />)}
          </div>
        </section>
      )}

      <section className="performance-card">
        <div className="card-heading">
          <div>
            <p className="section-label">Performance breakdown</p>
            <h2>Target versus achievement</h2>
          </div>
          <div className="view-tabs" role="group" aria-label="Group results by">
            {(["district", "block", "ivcs"] as const).map((item) => (
              <button
                key={item}
                className={view === item ? "active" : ""}
                onClick={() => {
                  setView(item);
                  setQuery("");
                }}
              >
                {item === "ivcs" ? "IVCS" : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="table-tools">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${view === "ivcs" ? "IVCS" : `${view}s`}…`}
              aria-label={`Search ${view}`}
            />
          </label>
          <button onClick={downloadCsv} className="download-button">Download CSV</button>
        </div>

        <div className="performance-grid">
          <div className="ranking target-ranking">
            <div className="table-head target-table-head">
              <span>{view === "ivcs" ? "IVCS" : view}</span>
              <span>Achievement</span>
              <span>Target</span>
              <span>Progress</span>
            </div>
            {loading && data.records.length === 0 ? (
              <div className="empty">Loading targets and live performance…</div>
            ) : visibleRows.length === 0 ? (
              <div className="empty">No matching results</div>
            ) : (
              visibleRows.map((row, index) => {
                const progress = percentage(row.registrations, row.target);
                return (
                  <button
                    className={`rank-row target-rank-row ${
                      view === "ivcs" && row.registrations === 0
                        ? "not-started-row"
                        : ""
                    }`}
                    key={row.name}
                    onClick={() => {
                      if (view === "district") {
                        setDistrict(row.name);
                        setBlock("All blocks");
                        setIvcs("All IVCS");
                        setView("block");
                      } else if (view === "block") {
                        setBlock(row.name);
                        setIvcs("All IVCS");
                        setView("ivcs");
                      }
                    }}
                  >
                    <span className="rank-number">{index + 1}</span>
                    <span className="rank-name">
                      <strong>{row.name}</strong>
                      {view === "ivcs" && (
                        <small className="location-label">
                          <span>District:</span> {row.district}
                          {row.block && <> <em>•</em> <span>Block:</span> {row.block}</>}
                        </small>
                      )}
                      <i><b style={{ width: `${Math.min(progress, 100)}%` }} /></i>
                    </span>
                    <span className="metric achievement">{row.registrations.toLocaleString("en-IN")}</span>
                    <span className="metric">{row.target.toLocaleString("en-IN")}</span>
                    <span className={`progress-pill ${progress >= 100 ? "complete" : progress === 0 ? "zero" : ""}`}>
                      {view === "ivcs" && row.registrations === 0
                        ? "Not Started"
                        : `${progress.toFixed(1)}%`}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <aside className="insight-panel">
            <p className="section-label">Selected view</p>
            <h3>{ivcs !== "All IVCS" ? ivcs : block !== "All blocks" ? block : district !== "All districts" ? district : region !== "All regions" ? region : "Meghalaya"}</h3>
            <div className="donut" style={{ "--value": `${Math.min(overallProgress, 100)}%` } as React.CSSProperties}>
              <div>
                <strong>{overallProgress.toFixed(1)}%</strong>
                <span>achieved</span>
              </div>
            </div>
            <dl>
              <div><dt>Registrations</dt><dd>{achievement.toLocaleString("en-IN")}</dd></div>
              <div><dt>Target</dt><dd>{target.toLocaleString("en-IN")}</dd></div>
              <div><dt>Remaining gap</dt><dd>{gap.toLocaleString("en-IN")}</dd></div>
              <div><dt>Coverage</dt><dd>{activeIvcs} of {filtered.length} IVCS reporting</dd></div>
            </dl>
            <p className="note">Select a row to drill down from district to block and IVCS.</p>
          </aside>
        </div>
      </section>

      <footer>
        <span>Cooperative Registration Tracking • Meghalaya</span>
        <span>Targets from regional IVCS workbook • Live API achievement</span>
      </footer>
    </main>
  );
}
