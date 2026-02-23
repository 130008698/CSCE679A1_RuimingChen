/**
 * main.js
 * Hong Kong Monthly Temperature Matrix
 *
 * Visualizes daily temperature data as a heatmap where:
 *   - X axis = year, Y axis = month
 *   - Cell background color = average max (or min) temperature for that month
 *   - Each cell contains a mini sparkline showing daily max and min temperature
 *   - Click the chart to toggle between max and min temperature views
 *   - Hover a cell for an exact value tooltip
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of most-recent years to display */
const YEAR_COUNT = 10;

/** Month labels for Y axis and tooltip */
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fixed temperature range for the color scale and legend (°C) */
const TEMP_MIN = 0;
const TEMP_MAX = 40;

/** Outer margins around the chart area (in pixels) */
const margin = { top: 40, right: 40, bottom: 40, left: 60 };

/** Pixel dimensions of each matrix cell */
const cellWidth  = 80;
const cellHeight = 50;

/** Legend bar dimensions and spacing */
const legendWidth     = 200;
const legendHeight    = 14;
const legendMarginTop = 24; // vertical gap between matrix bottom and legend

// ─── Data Helpers ─────────────────────────────────────────────────────────────

/**
 * Parses a raw CSV row into a typed object.
 * d3.csv() passes each row as plain strings, so we convert here.
 *
 * @param {Object} d - Raw CSV row
 * @returns {{ date: Date, max: number, min: number }}
 */
function parseRow(d) {
  return {
    date: new Date(d.date),
    max:  +d.max_temperature,
    min:  +d.min_temperature,
  };
}

/**
 * Filters the dataset to only the last N calendar years present in the data.
 * The max year is derived from the data itself, not today's date.
 *
 * @param {Array} data - Parsed daily rows
 * @param {number} n   - Number of years to keep
 * @returns {Array}
 */
function filterLastYears(data, n) {
  const maxYear = d3.max(data, d => d.date.getFullYear());
  return data.filter(d => d.date.getFullYear() > maxYear - n);
}

/**
 * Groups daily rows into one object per (year, month) pair.
 * Each object stores the average max/min for cell coloring,
 * plus the raw daily rows for the sparkline.
 *
 * Uses d3.group() which returns a nested Map:
 *   Map<year, Map<month, day[]>>
 *
 * @param {Array} data - Filtered daily rows
 * @returns {Array<{ year, month, avgMax, avgMin, days }>}
 */
function aggregateByYearMonth(data) {
  const grouped = d3.group(data,
    d => d.date.getFullYear(),
    d => d.date.getMonth()   // 0 = January … 11 = December
  );

  const cells = [];
  for (const [year, monthMap] of grouped) {
    for (const [month, days] of monthMap) {
      cells.push({
        year,
        month,
        avgMax: d3.mean(days, d => d.max),
        avgMin: d3.mean(days, d => d.min),
        days,   // kept for sparkline rendering
      });
    }
  }
  return cells;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

/**
 * Displays the floating tooltip near the cursor.
 * Offset by a few pixels so it doesn't sit directly under the pointer.
 *
 * @param {MouseEvent} event - The triggering mouse event
 * @param {string}     html  - HTML string to show inside the tooltip
 */
function showTooltip(event, html) {
  d3.select("#tooltip")
    .style("display", "block")
    .style("left", (event.pageX + 14) + "px")
    .style("top",  (event.pageY - 36) + "px")
    .html(html);
}

/**
 * Hides the floating tooltip.
 * Called on mouseout — no parameters needed since there is only one tooltip.
 */
function hideTooltip() {
  d3.select("#tooltip").style("display", "none");
}

// ─── Sparklines ───────────────────────────────────────────────────────────────

/**
 * Draws two mini line charts (sparklines) inside every cell:
 *   - A darker line for daily max temperature
 *   - A lighter line for daily min temperature
 *
 * Both lines share a single global y scale so trends are comparable
 * across all cells. The x scale maps day-of-month to pixel position
 * within the cell.
 *
 * pointer-events: none ensures the lines don't block cell hover events.
 *
 * @param {d3.Selection} g       - The SVG <g> container for the whole matrix
 * @param {Array}        cells   - Aggregated (year, month) cell objects
 * @param {d3.ScaleBand} xScale  - Band scale mapping year → x pixel
 * @param {d3.ScaleBand} yScale  - Band scale mapping month → y pixel
 */
function drawSparklines(g, cells, xScale, yScale) {
  const pad   = 4; // inset padding so lines don't touch cell edges
  const cellW = xScale.bandwidth();
  const cellH = yScale.bandwidth();

  // Use the global min/max across all days so all sparklines share the same y scale
  const tempMin = d3.min(cells, c => d3.min(c.days, d => d.min));
  const tempMax = d3.max(cells, c => d3.max(c.days, d => d.max));

  cells.forEach(cell => {
    const cx = xScale(cell.year);
    const cy = yScale(cell.month);

    // Map day index (1-based) to x pixel within this cell
    const sparkX = d3.scaleLinear()
      .domain([1, cell.days.length])
      .range([cx + pad, cx + cellW - pad]);

    // Map temperature to y pixel within this cell (inverted: higher temp = higher on screen)
    const sparkY = d3.scaleLinear()
      .domain([tempMin, tempMax])
      .range([cy + cellH - pad, cy + pad]);

    const lineMax = d3.line()
      .x((_d, i) => sparkX(i + 1))
      .y(d => sparkY(d.max));

    const lineMin = d3.line()
      .x((_d, i) => sparkX(i + 1))
      .y(d => sparkY(d.min));

    // Daily max line (darker stroke)
    g.append("path")
      .datum(cell.days)
      .attr("class", "sparkline")
      .attr("d", lineMax)
      .attr("fill", "none")
      .attr("stroke", "rgba(0,0,0,0.5)")
      .attr("stroke-width", 2.5)
      .attr("pointer-events", "none");

    // Daily min line (lighter stroke)
    g.append("path")
      .datum(cell.days)
      .attr("class", "sparkline")
      .attr("d", lineMin)
      .attr("fill", "none")
      .attr("stroke", "rgba(0,0,0,0.2)")
      .attr("stroke-width", 2.5)
      .attr("pointer-events", "none");
  });
}

// ─── Legend ───────────────────────────────────────────────────────────────────

/**
 * Draws a horizontal gradient color legend bar with a temperature axis below it.
 *
 * The gradient always runs blue (cold) → red (hot), matching the cell color scale.
 * The axis tick values are fixed from TEMP_MIN to TEMP_MAX (0–40°C).
 *
 * Uses an SVG <linearGradient> defined in <defs> and referenced via fill="url(...)".
 *
 * @param {d3.Selection} svg - The root SVG element
 * @param {number}       x   - X position of the legend (pixels)
 * @param {number}       y   - Y position of the legend (pixels)
 */
function drawLegend(svg, x, y) {
  // Define a linear gradient in <defs> with 11 color stops (0% to 100%)
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "legend-gradient");

  grad.selectAll("stop")
    .data(d3.range(0, 1.01, 0.1))
    .join("stop")
      .attr("offset", d => `${d * 100}%`)
      // interpolateRdYlBu(1 - t) maps t=0 → blue (cold) and t=1 → red (hot)
      .attr("stop-color", d => d3.interpolateRdYlBu(1 - d));

  const lg = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${x},${y})`);

  // The colored bar, filled with the gradient defined above
  lg.append("rect")
    .attr("width",  legendWidth)
    .attr("height", legendHeight)
    .attr("rx", 3)
    .attr("fill", "url(#legend-gradient)");

  // Fixed scale from TEMP_MIN to TEMP_MAX
  const legendScale = d3.scaleLinear()
    .domain([TEMP_MIN, TEMP_MAX])
    .range([0, legendWidth]);

  lg.append("g")
    .attr("class", "legend-axis")
    .attr("transform", `translate(0, ${legendHeight})`)
    .call(d3.axisBottom(legendScale).ticks(5).tickFormat(d => `${d}°C`));
}


// ─── Color Scale ──────────────────────────────────────────────────────────────

/**
 * Builds a D3 sequential color scale over the fixed temperature range.
 *
 * The domain is reversed [TEMP_MAX, TEMP_MIN] so that:
 *   high temperature → interpolateRdYlBu(0) → red
 *   low  temperature → interpolateRdYlBu(1) → blue
 *
 * @returns {d3.ScaleSequential}
 */
function buildColorScale() {
  // Domain reversed [TEMP_MAX, TEMP_MIN] so hot = red, cold = blue
  return d3.scaleSequential(d3.interpolateRdYlBu)
    .domain([TEMP_MAX, TEMP_MIN]);
}

// ─── Matrix ───────────────────────────────────────────────────────────────────

/** Tracks whether the chart is showing "max" or "min" temperature */
let mode = "max";

/**
 * Renders the full temperature matrix visualization into #chart:
 *   1. Sizes the SVG to fit the matrix + legend
 *   2. Draws a colored rect per (year, month) cell
 *   3. Attaches X and Y axes
 *   4. Overlays sparklines on each cell
 *   5. Draws the color legend below
 *   6. Wires up the click-to-toggle and hover tooltip interactions
 *
 * @param {Array} cells - Aggregated (year, month) cell objects
 * @param {Array} years - Sorted array of year numbers to display
 */
function drawMatrix(cells, years) {
  const svgWidth  = margin.left + years.length * cellWidth  + margin.right;
  const svgHeight = margin.top  + 12 * cellHeight + margin.bottom
                  + legendMarginTop + legendHeight + 24; // +24 for axis ticks below legend

  const svg = d3.select("#chart")
    .attr("width",  svgWidth)
    .attr("height", svgHeight)
    .style("cursor", "pointer")
    .on("click", () => {
      // Flip mode, rebuild color scale, and re-color all cells with a transition
      mode = mode === "max" ? "min" : "max";
      const colorScale = buildColorScale();
      const accessor   = mode === "max" ? d => d.avgMax : d => d.avgMin;

      svg.selectAll("rect.cell")
        .transition().duration(400)
        .attr("fill", d => colorScale(accessor(d)));

      // Legend scale is fixed (TEMP_MIN–TEMP_MAX), no update needed

      // Update the mode label in the page header
      d3.select("#mode-label")
        .text(`Showing: ${mode === "max" ? "Max" : "Min"} Temp`);
    });

  // Main <g> offset by margins so axes have room
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // X scale: one band per year across the full matrix width
  const xScale = d3.scaleBand()
    .domain(years)
    .range([0, years.length * cellWidth])
    .padding(0.05);

  // Y scale: one band per month (0–11) across the full matrix height
  const yScale = d3.scaleBand()
    .domain(d3.range(12))
    .range([0, 12 * cellHeight])
    .padding(0.05);

  const colorScale = buildColorScale();

  // One rect per cell — color encodes the temperature for the current mode.
  // Data is bound here so the click handler can re-color by accessing d.avgMax / d.avgMin.
  // The initial accessor matches the initial mode ("max").
  const initialAccessor = d => d.avgMax;
  g.selectAll("rect.cell")
    .data(cells)
    .join("rect")
      .attr("class", "cell")
      .attr("x",      d => xScale(d.year))
      .attr("y",      d => yScale(d.month))
      .attr("width",  xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .attr("fill",   d => colorScale(initialAccessor(d)))
      .attr("rx", 2)  // slightly rounded corners
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .on("mouseover", (event, d) => {
        // Read `mode` at hover time so the label is always correct after toggling
        const temp  = mode === "max" ? d.avgMax : d.avgMin;
        const label = `<strong>${MONTH_NAMES[d.month]} ${d.year}</strong><br/>
                       Avg ${mode === "max" ? "Max" : "Min"}: ${temp.toFixed(1)}°C`;
        showTooltip(event, label);
      })
      .on("mouseout", hideTooltip);

  // X axis — format year as an integer (no comma separator)
  g.append("g")
    .attr("transform", `translate(0, ${12 * cellHeight})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));

  // Y axis — show month abbreviations instead of 0–11
  g.append("g")
    .call(d3.axisLeft(yScale).tickFormat(i => MONTH_NAMES[i]));

  drawSparklines(g, cells, xScale, yScale);

  // Legend sits below the matrix with a small gap
  const legendX = margin.left;
  const legendY = margin.top + 12 * cellHeight + margin.bottom + legendMarginTop;
  drawLegend(svg, legendX, legendY);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

d3.csv("temperature_daily.csv", parseRow).then(data => {
  const filtered = filterLastYears(data, YEAR_COUNT);
  const cells    = aggregateByYearMonth(filtered);
  const years    = [...new Set(filtered.map(d => d.date.getFullYear()))].sort();

  drawMatrix(cells, years);
});
