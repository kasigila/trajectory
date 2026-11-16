import { useEffect, useMemo, useRef, useState } from "react";
import { centralCrossing } from "../model/crossing";
import { formatDate } from "../model/dates";
import { trendNote, weeklyPoints } from "../model/trend-note";
import { formatKg, formatKcal, kgToLb, round1 } from "../model/units";
import { weighInsFar } from "../format";

export interface SeriesPoint {
  date: string;
  kg: number;
  lower?: number;
  upper?: number;
  intake?: number;
  expenditure?: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  dash?: string;
  points: SeriesPoint[];
  band?: boolean;
}

interface Observation {
  id: string;
  date: string;
  kg: number;
  source: string;
}

interface Props {
  series: ChartSeries[];
  observations?: Observation[];
  trend?: { date: string; kg: number }[];
  cycleDates?: string[];
  today?: string | null;
  goalKg?: number | null;
  goalDate?: string | null;
  goalLabel?: string;
  milestones?: { date: string; label: string }[];
  unit: "kg" | "lb";
  hideAbsolute?: boolean;
  dateStyle?: "iso" | "dmy" | "mdy" | "long";
  caption: string;
  prominent?: boolean;
}

const PAD = { l: 64, r: 16, t: 22, b: 40 };

export function TrajectoryChart(props: Props) {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 960px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 960px)");
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  const W = narrow ? 480 : 800;
  const H = narrow ? 680 : 420;
  const dates = useMemo(() => collectDates(props), [props]);
  const anchor = props.series[0]?.points[0]?.kg ?? props.observations?.[0]?.kg ?? 0;
  const plot = (kg: number) => {
    const value = props.hideAbsolute ? kg - anchor : kg;
    return props.unit === "lb" ? kgToLb(value) : value;
  };
  const [focus, setFocus] = useState<string | null>(dates.at(-1) ?? null);
  const [showAll, setShowAll] = useState(false);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!focus || !dates.includes(focus)) setFocus(dates.at(-1) ?? null);
  }, [dates, focus]);

  const seriesValues = props.series.flatMap((series) => series.points.flatMap((p) => [plot(p.kg), p.lower != null ? plot(p.lower) : plot(p.kg), p.upper != null ? plot(p.upper) : plot(p.kg)]));
  const seriesMin = seriesValues.length ? Math.min(...seriesValues) : null;
  const seriesMax = seriesValues.length ? Math.max(...seriesValues) : null;
  const slack = seriesMin != null && seriesMax != null ? Math.max(1.5, (seriesMax - seriesMin) * 0.8) : Infinity;
  const inScale = (value: number) => {
    if (seriesMin == null || seriesMax == null) return true;
    return value >= seriesMin - slack && value <= seriesMax + slack;
  };
  const offScaleObservations = (props.observations ?? []).filter((obs) => !inScale(plot(obs.kg)));
  const yValues = [
    ...seriesValues,
    ...(props.observations ?? []).filter((obs) => inScale(plot(obs.kg))).map((obs) => plot(obs.kg)),
    ...(props.trend ?? []).filter((item) => inScale(plot(item.kg))).map((item) => plot(item.kg)),
    props.goalKg != null && !props.hideAbsolute && inScale(plot(props.goalKg)) ? plot(props.goalKg) : null,
  ].filter((n): n is number => n != null && Number.isFinite(n));
  const min = yValues.length ? Math.min(...yValues) : 0;
  const max = yValues.length ? Math.max(...yValues) : 1;
  const padY = Math.max(0.4, (max - min) * 0.12);
  const y0 = min - padY;
  const y1 = max + padY;
  const xOf = (date: string) => {
    if (dates.length < 2) return PAD.l + (W - PAD.l - PAD.r) / 2;
    const t0 = Date.parse(dates[0] + "T00:00:00Z");
    const t1 = Date.parse(dates[dates.length - 1] + "T00:00:00Z");
    const t = Date.parse(date + "T00:00:00Z");
    return PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  };
  const yOfPlot = (value: number) => {
    const plotH = H - PAD.t - PAD.b;
    return PAD.t + (1 - (value - y0) / (y1 - y0 || 1)) * plotH;
  };
  const yOf = (kg: number) => yOfPlot(plot(kg));
  const ticks = niceTicks(y0, y1, 4);
  const focusIndex = Math.max(0, dates.indexOf(focus ?? dates[0] ?? ""));

  function move(step: number) {
    if (!dates.length) return;
    const next = dates[Math.min(dates.length - 1, Math.max(0, focusIndex + step))];
    setFocus(next);
  }

  function nearest(clientX: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = dates[0];
    let dist = Infinity;
    for (const date of dates) {
      const d = Math.abs(xOf(date) - x);
      if (d < dist) {
        dist = d;
        best = date;
      }
    }
    if (best) setFocus(best);
  }

  const live = describeFocus(props, focus, anchor);
  const summary = textSummary(props, anchor);

  async function copyTrend() {
    const series = props.series[0];
    const rows = weeklyPoints(series?.points ?? []).map((point) => ({
      date: formatDate(point.date, props.dateStyle ?? "dmy"),
      value: shown(point.kg, props, anchor),
      range: rangePhrase(point.lower, point.upper, props, anchor),
    }));
    const text = trendNote({ title: series?.label ?? "Weight trend", rows });
    try {
      await navigator.clipboard.writeText(text);
      setNoteStatus("Copied. Paste it into Notes or any other app.");
    } catch {
      setNoteStatus("Copy was blocked by the browser. The data table below can still be selected.");
    }
  }

  async function savePicture() {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const blob = await pictureOf(svg, W, H);
      const file = new File([blob], "trajectory-weight-trend.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Weight trend", text: summary });
        setNoteStatus("Share sheet opened. You can send the chart to Notes.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "trajectory-weight-trend.png";
      link.click();
      URL.revokeObjectURL(url);
      setNoteStatus("Chart picture saved. Open it from your downloads.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNoteStatus("The chart picture could not be saved. Copy for notes still works.");
    }
  }

  return (
    <figure className={props.prominent ? "chart-block chart-hero" : "chart-block"}>
      <figcaption>
        <p>{props.caption}</p>
      </figcaption>
      <div
        className="chart-plot"
        tabIndex={0}
        role="group"
        aria-label={`${props.caption}. ${summary} Use left and right arrow keys to inspect a date. A data table follows.`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "Home") {
            event.preventDefault();
            setFocus(dates[0] ?? null);
          } else if (event.key === "End") {
            event.preventDefault();
            setFocus(dates.at(-1) ?? null);
          }
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="presentation"
          aria-hidden="true"
          ref={svgRef}
          onPointerDown={(event) => nearest(event.clientX, event.currentTarget)}
          onPointerMove={(event) => nearest(event.clientX, event.currentTarget)}
        >
          <text x={14} y={PAD.t} className="axis-name">{props.hideAbsolute ? `Change, ${props.unit}` : props.unit}</text>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yOfPlot(tick)} y2={yOfPlot(tick)} className="grid" />
              <text x={PAD.l - 8} y={yOfPlot(tick) + 4} className="tick">
                {tick.toFixed(1)}
              </text>
            </g>
          ))}
          {props.series.filter((series) => series.band).map((series) => (
            <path key={series.id + "-band"} d={bandPath(series, xOf, yOf)} className="band" />
          ))}
          {props.goalKg != null && !props.hideAbsolute && inScale(plot(props.goalKg)) ? (
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(props.goalKg)} y2={yOf(props.goalKg)} className="goal" />
          ) : null}
          {props.goalDate && dates.length && props.goalDate >= dates[0] && props.goalDate <= dates[dates.length - 1] ? (
            <g>
              <line x1={xOf(props.goalDate)} x2={xOf(props.goalDate)} y1={PAD.t} y2={H - PAD.b} className="goal" />
              <text x={xOf(props.goalDate) + 4} y={PAD.t + 28} className="milestone-label">Target date</text>
            </g>
          ) : null}
          {props.trend && props.trend.length > 1 ? <path d={linePath(props.trend.map((p) => [xOf(p.date), yOf(p.kg)]))} className="trend" /> : null}
          {props.series.map((series, index) => (
            <path key={series.id} d={linePath(series.points.map((p) => [xOf(p.date), yOf(p.kg)]))} className={`series series-${index}`} style={{ strokeDasharray: series.dash }} />
          ))}
          {(props.observations ?? []).filter((obs) => inScale(plot(obs.kg))).map((obs, index) => (
            <circle key={obs.id} cx={xOf(obs.date) + (index % 3) - 1} cy={yOf(obs.kg)} r="4.2" className="obs" />
          ))}
          {(props.cycleDates ?? []).map((date) => (
            <line key={date} x1={xOf(date)} x2={xOf(date)} y1={PAD.t} y2={H - PAD.b} className="cycle" />
          ))}
          {(props.milestones ?? []).map((mark) => (
            <g key={`${mark.date}-${mark.label}`}>
              <line x1={xOf(mark.date)} x2={xOf(mark.date)} y1={PAD.t + 16} y2={H - PAD.b} className="milestone" />
              <text x={xOf(mark.date) + 4} y={PAD.t + 28} className="milestone-label">{mark.label}</text>
            </g>
          ))}
          {props.today && dates.length && props.today >= dates[0] && props.today <= dates[dates.length - 1] ? (
            <g>
              <line x1={xOf(props.today)} x2={xOf(props.today)} y1={PAD.t} y2={H - PAD.b} className="today" />
              <text x={xOf(props.today) + 4} y={PAD.t + 12} className="today-label">
                Today
              </text>
            </g>
          ) : null}
          {focus ? <line x1={xOf(focus)} x2={xOf(focus)} y1={PAD.t} y2={H - PAD.b} className="focus-line" /> : null}
          {dates.length ? (
            <>
              <text x={PAD.l} y={H - 14} className="tick date">
                {formatDate(dates[0], props.dateStyle ?? "dmy")}
              </text>
              <text x={(PAD.l + W - PAD.r) / 2} y={H - 14} className="tick date mid">
                {formatDate(dates[Math.floor((dates.length - 1) / 2)], props.dateStyle ?? "dmy")}
              </text>
              <text x={W - PAD.r} y={H - 14} className="tick date end">
                {formatDate(dates[dates.length - 1], props.dateStyle ?? "dmy")}
              </text>
            </>
          ) : null}
        </svg>
      </div>
      <p className="live" aria-live="polite">
        {live}
      </p>
      <p className="summary">{summary}</p>
      <div className="chart-actions">
        <button type="button" className="btn" onClick={() => void copyTrend()}>Copy for notes</button>
        <button type="button" className="btn" onClick={() => void savePicture()}>Save or share chart</button>
      </div>
      {noteStatus ? <p className="fine" role="status">{noteStatus}</p> : null}
      {offScaleObservations.length ? (
        <p className="fine">{weighInsFar(offScaleObservations.length)}</p>
      ) : null}
      <ul className="legend">
        {props.series.map((series, index) => (
          <li key={series.id}>
            <i className={`swatch series-${index}`} style={{ borderTopStyle: series.dash ? "dashed" : "solid" }} />
            {series.band && seriesHasRange(series, props, anchor) ? `${series.label}, with a sensitivity range` : series.label}
          </li>
        ))}
        {props.trend?.length ? (
          <li>
            <i className="swatch trend" /> Trend estimate
          </li>
        ) : null}
        {props.observations?.length ? (
          <li>
            <i className="swatch obs" /> Observed weigh-ins
          </li>
        ) : null}
        {props.cycleDates?.length ? (
          <li>
            <i className="swatch cycle" /> Cycle context, not used by the model
          </li>
        ) : null}
        {props.goalKg != null ? (
          <li>
            <i className="swatch goal" /> {props.goalLabel || "Chart marker"}{props.goalDate ? `, target date ${formatDate(props.goalDate, props.dateStyle ?? "dmy")}` : ""}, not a recommendation
          </li>
        ) : null}
      </ul>
      {props.goalKg != null ? <p className="fine">{crossingSentence(props, props.goalKg)}</p> : null}
      <details className="table-disclosure">
        <summary>Data table</summary>
        {dates.length > 21 ? (
          <button type="button" className="btn quiet" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show fewer dates" : `Show all ${dates.length} dates`}
          </button>
        ) : null}
        <div className="table-wrap">
          <table>
            <caption>{props.caption}. Shown to 0.1 {props.unit}. The range is sensitivity, not a promise.</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                {props.series.map((series) => (
                  <th key={series.id} scope="col">
                    {series.label}
                  </th>
                ))}
                {props.series.some((s) => s.band) ? (
                  <>
                    <th scope="col">Sensitivity low</th>
                    <th scope="col">Sensitivity high</th>
                  </>
                ) : null}
                <th scope="col">Observed</th>
                <th scope="col">Trend</th>
              </tr>
            </thead>
            <tbody>
              {(showAll || dates.length <= 21 ? dates : [...dates.slice(0, 14), ...dates.slice(-7)]).map((date) => (
                <tr key={date} className={date === focus ? "is-focus" : undefined}>
                  <th scope="row">{formatDate(date, props.dateStyle ?? "dmy")}</th>
                  {props.series.map((series) => {
                    const point = series.points.find((item) => item.date === date);
                    return <td key={series.id}>{point ? cell(point.kg, props, anchor) : "—"}</td>;
                  })}
                  {props.series.some((s) => s.band) ? (
                    <>
                      <td>{rangeCell(props.series.find((s) => s.band)?.points.find((p) => p.date === date)?.lower, props.series.find((s) => s.band)?.points.find((p) => p.date === date)?.kg, props, anchor)}</td>
                      <td>{rangeCell(props.series.find((s) => s.band)?.points.find((p) => p.date === date)?.upper, props.series.find((s) => s.band)?.points.find((p) => p.date === date)?.kg, props, anchor)}</td>
                    </>
                  ) : null}
                  <td>{obsText(props, date, anchor)}</td>
                  <td>{cell(props.trend?.find((t) => t.date === date)?.kg, props, anchor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function crossingSentence(props: Props, targetKg: number) {
  const series = props.series[0];
  const hit = series ? centralCrossing(series.points.map((point) => ({ date: point.date, centralKg: point.kg })), targetKg) : null;
  const style = props.dateStyle ?? "dmy";
  const marked = props.goalDate ? ` The marked date is ${formatDate(props.goalDate, style)}.` : "";
  if (!hit) return `The central series does not reach this chart marker inside the saved horizon.${marked} No scale date is promised.`;
  const whenHit = formatDate(hit.date, style);
  const against = !props.goalDate ? "" : hit.date === props.goalDate ? " That is on the marked date." : hit.date < props.goalDate ? " That is before the marked date." : " That is after the marked date.";
  return `The central series reaches this chart marker on ${whenHit}.${against}${marked} That is arithmetic on the central series, not a validated prediction of a scale reading.`;
}

async function pictureOf(svg: SVGSVGElement, width: number, height: number): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  copyPaint(svg, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width * 2));
  clone.setAttribute("height", String(height * 2));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("chart image"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("png");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function copyPaint(source: Element, clone: Element) {
  const paint = getComputedStyle(source);
  if (clone instanceof SVGElement) {
    clone.setAttribute("fill", paint.fill);
    clone.setAttribute("stroke", paint.stroke);
    clone.setAttribute("stroke-width", paint.strokeWidth);
    clone.setAttribute("font-size", paint.fontSize);
    clone.setAttribute("font-family", paint.fontFamily);
    if (paint.strokeDasharray && paint.strokeDasharray !== "none") clone.setAttribute("stroke-dasharray", paint.strokeDasharray);
  }
  const sourceChildren = [...source.children];
  const cloneChildren = [...clone.children];
  sourceChildren.forEach((child, index) => {
    const next = cloneChildren[index];
    if (next) copyPaint(child, next);
  });
}

function shown(kg: number, props: Props, anchor: number) {
  if (props.hideAbsolute) {
    const delta = props.unit === "lb" ? kgToLb(kg - anchor) : kg - anchor;
    return `${round1(delta).toFixed(1)} ${props.unit} from the first point`;
  }
  return formatKg(kg, props.unit, false);
}

function rangeCell(edge: number | undefined, central: number | undefined, props: Props, anchor: number) {
  if (edge == null || central == null || shown(edge, props, anchor) === shown(central, props, anchor)) return "—";
  return shown(edge, props, anchor);
}

function cell(kg: number | null | undefined, props: Props, anchor: number) {
  if (kg == null || !Number.isFinite(kg)) return "—";
  return shown(kg, props, anchor);
}

function obsText(props: Props, date: string, anchor: number) {
  const rows = (props.observations ?? []).filter((obs) => obs.date === date);
  if (!rows.length) return "—";
  return rows.map((obs) => `${cell(obs.kg, props, anchor)} (${obs.source})`).join("; ");
}

function collectDates(props: Props) {
  const set = new Set<string>();
  props.series.forEach((series) => series.points.forEach((p) => set.add(p.date)));
  props.observations?.forEach((o) => set.add(o.date));
  props.trend?.forEach((t) => set.add(t.date));
  return [...set].sort();
}

function bandPath(series: ChartSeries, xOf: (d: string) => number, yOf: (kg: number) => number) {
  const points = series.points.filter((p) => p.lower != null && p.upper != null);
  if (!points.length) return "";
  const top = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.date).toFixed(1)} ${yOf(p.upper ?? p.kg).toFixed(1)}`);
  const bottom = [...points].reverse().map((p) => `L ${xOf(p.date).toFixed(1)} ${yOf(p.lower ?? p.kg).toFixed(1)}`);
  return `${top.join(" ")} ${bottom.join(" ")} Z`;
}

function linePath(points: Array<[number, number]>) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
}

function niceTicks(min: number, max: number, count: number) {
  const span = max - min || 1;
  const step = span / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(min + step * i);
  return ticks.map((tick) => Math.round(tick * 10) / 10);
}

function describeFocus(props: Props, date: string | null, anchor: number) {
  if (!date) return "No dates to inspect.";
  const bits = [formatDate(date, props.dateStyle ?? "dmy")];
  props.series.forEach((series) => {
    const point = series.points.find((item) => item.date === date);
    if (!point) return;
    bits.push(`${series.label}: ${shown(point.kg, props, anchor)}`);
    const range = rangePhrase(point.lower, point.upper, props, anchor);
    if (range) bits.push(`sensitivity range ${range}`);
    if (point.intake != null) bits.push(`planned intake ${formatKcal(point.intake)}`);
    if (point.expenditure != null) bits.push(`Expenditure ${formatKcal(point.expenditure)}`);
  });
  const obs = (props.observations ?? []).filter((item) => item.date === date);
  if (obs.length) bits.push(`observed ${obs.map((item) => `${shown(item.kg, props, anchor)}, ${item.source}`).join("; ")}`);
  else bits.push("no weigh-in on this date");
  const trend = props.trend?.find((item) => item.date === date);
  if (trend) bits.push(`trend estimate ${shown(trend.kg, props, anchor)}`);
  bits.push("These points are the saved plan, not a scale reading.");
  return bits.join(". ");
}

function textSummary(props: Props, anchor: number) {
  const primary = props.series[0];
  if (!primary?.points.length) return "No forecast is drawn.";
  const first = primary.points[0];
  const last = primary.points[primary.points.length - 1];
  const a = shown(first.kg, props, anchor);
  const b = shown(last.kg, props, anchor);
  const range = rangePhrase(last.lower, last.upper, props, anchor);
  const rangeSentence = range ? ` On the last day the sensitivity range is ${range}.` : ` The two ends round to the same 0.1 ${props.unit}, so no band is shown.`;
  return `The first series runs from ${a} on ${formatDate(first.date, props.dateStyle ?? "dmy")} to ${b} on ${formatDate(last.date, props.dateStyle ?? "dmy")}.${rangeSentence} This is not a predicted scale reading.`;
}

function rangePhrase(lower: number | undefined, upper: number | undefined, props: Props, anchor: number) {
  if (lower == null || upper == null || !Number.isFinite(lower) || !Number.isFinite(upper)) return null;
  const low = shown(lower, props, anchor);
  const high = shown(upper, props, anchor);
  if (low === high) return null;
  return `${low} to ${high}`;
}

function seriesHasRange(series: ChartSeries, props: Props, anchor: number) {
  return series.points.some((point) => rangePhrase(point.lower, point.upper, props, anchor));
}
