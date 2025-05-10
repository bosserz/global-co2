// Create color for each region
const regionColors = {
    "Asia": "#A63D40",
    "Europe": "#3C91E6",
    "Americas": "#F6AE2D",
    "Africa": "#F6BDD1",
    "Oceania": "#9FD356"
};

function createRegionLegend() {
    const legendDiv = d3.select("#legendItems");

    // Create legend items
    Object.entries(regionColors).forEach(([region, color]) => {
        const item = legendDiv.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("margin-bottom", "5px");

        item.append("div")
            .style("width", "15px")
            .style("height", "15px")
            .style("margin-right", "8px")
            .style("background-color", color)
            .style("border-radius", "3px");

        item.append("span")
            .text(region)
            .style("font-size", "14px");
    });
}

let globalData;
let selectedYear = 2022; // Default year

d3.csv("data_co2.csv").then(function(data) {
    data.forEach(d => {
        d.year = +d.year;
        d.co2 = +d.co2;
        d.gdp = +d.gdp;
        d.population = +d.population;
    });

    data = data.filter(d => d.year >= 1990 && d.year <= 2022);

    createRegionLegend();
    globalData = data;

    createBarChart(globalData);
    createCO2CountryChart(globalData);
    createScatterPlot(globalData);
    createSunburstChart(globalData);
});

function createBarChart(data) {
    const margin = { top: 30, right: 30, bottom: 50, left: 120 },
        width = 800 - margin.left - margin.right,
        height = 400 - margin.top - margin.bottom;

    const svg = d3.select("#barChart").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const tooltip = d3.select("#barTooltip");

    const years = Array.from(new Set(data.map(d => d.year))).sort((a, b) => a - b);
    const yearSelect = d3.select("#yearSelect");
    yearSelect.selectAll("option")
        .data(years)
        .enter().append("option")
        .attr("value", d => d)
        .text(d => d);

    yearSelect.property("value", selectedYear);

    let selectedRegion = null;

    function updateBarChart(year) {
        selectedYear = year; // Update year
        const co2ByRegion = d3.rollups(
            data.filter(d => d.year == year && d.co2 > 0),
            v => d3.sum(v, d => d.co2),
            d => d.region
        ).map(([region, co2]) => ({ region, co2 }));

        co2ByRegion.sort((a, b) => b.co2 - a.co2);

        const y = d3.scaleBand()
            .domain(co2ByRegion.map(d => d.region))
            .range([0, height])
            .padding(0.2);

        const x = d3.scaleLinear()
            .domain([0, d3.max(co2ByRegion, d => d.co2)])
            .nice()
            .range([0, width]);

        const bars = svg.selectAll("rect")
            .data(co2ByRegion, d => d.region);

        bars.exit().remove();

        const barsEnter = bars.enter().append("rect")
            .attr("y", d => y(d.region))
            .attr("x", 0)
            .attr("height", y.bandwidth())
            .attr("fill", d => regionColors[d.region]);

        barsEnter.merge(bars)
            .transition().duration(500)
            .attr("y", d => y(d.region))
            .attr("width", d => x(d.co2))
            .attr("height", y.bandwidth());

        svg.selectAll("rect")
            .on("mouseover", function (event, d) {
                d3.select(this).style("opacity", 0.8);
                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.region}</strong><br>CO₂: ${d3.format(",.2f")(d.co2)} Mtons`)
                    .style("top", (event.pageY + 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mousemove", function (event) {
                tooltip.style("top", (event.pageY + 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                d3.select(this).style("opacity", 1);
                tooltip.style("visibility", "hidden");
            })
            .on("click", function (event, d) {
                selectedRegion = selectedRegion === d.region ? null : d.region;
                svg.selectAll("rect")
                    .style("opacity", r => selectedRegion === null || r.region === selectedRegion ? 1 : 0.3);
                window.updateSunburstChart(selectedYear, selectedRegion);
            });

        svg.selectAll(".y-axis").remove();
        svg.append("g")
            .attr("class", "y-axis axis-value")
            .call(d3.axisLeft(y));

        svg.selectAll(".x-axis").remove();
        svg.append("g")
            .attr("class", "x-axis axis-value")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x));

        d3.select("#barChart h3").text(`CO₂ Emissions by Region in ${year}`);
    }

    updateBarChart(selectedYear);

    yearSelect.on("change", function () {
        const newYear = +this.value;
        updateBarChart(newYear);
        window.updateSunburstChart(newYear, selectedRegion);
        window.updateScatterPlot(newYear, null); // Reset filter for consistency
        window.updateCO2CountryChart(data, null); // Reset to top 5
    });

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text("Total CO₂ Emissions (Million tons)");

    window.updateBarChart = updateBarChart;
}



function createScatterPlot(data) {
    const margin = { top: 30, right: 80, bottom: 60, left: 80 },
          width = 800 - margin.left - margin.right,
          height = 600 - margin.top - margin.bottom;

    const svg = d3.select("#scatterPlotNormal").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    data.forEach(d => d.gdp = d.gdp / 1_000_000_000);

    const tooltip = d3.select("#scatterTooltip");

    let xScale = d3.scaleLinear();
    let yScale = d3.scaleLinear();
    const sizeScale = d3.scaleLinear()
        .range([5, 20]);

    const xAxis = svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .attr("class", "axis-value");

    const yAxis = svg.append("g")
        .attr("class", "axis-value");

    const xAxisLabel = svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + 45)
        .attr("text-anchor", "middle")
        .style("font-size", "14px");

    const yAxisLabel = svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -margin.left + 20)
        .attr("text-anchor", "middle")
        .style("font-size", "14px");

    // Add brush layer
    const brushLayer = svg.append("g")
        .attr("class", "brush");

    // Add circles layer after brush
    const circles = svg.append("g");

    let selectedFilter = null;
    let isLogScale = false;

    const brush = d3.brush()
        .extent([[0, 0], [width, height]])
        .on("end", brushed);

    brushLayer.call(brush);

    function brushed(event) {
        if (!event.selection) {
            window.updateCO2CountryChart(data, null);
            circles.selectAll("circle").style("opacity", 0.6);
            return;
        }

        const [[x0, y0], [x1, y1]] = event.selection;
        const selectedCountries = [];

        circles.selectAll("circle").each(function(d) {
            const cx = xScale(d.co2);
            const cy = yScale(d.gdp);
            const isSelected = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
            d3.select(this).style("opacity", isSelected ? 1 : 0.3);
            if (isSelected) selectedCountries.push(d.country);
        });

        window.updateCO2CountryChart(data, selectedCountries);
    }

    function updateScatterPlot(year, filter = null) {
        selectedYear = year;
        let plotData = data.filter(d => d.year === year && d.co2 > 0 && d.gdp > 0);

        if (filter) {
            if (filter.type === "region") plotData = plotData.filter(d => d.region === filter.value);
            if (filter.type === "sub-region") plotData = plotData.filter(d => d["sub-region"] === filter.value);
            if (filter.type === "country") plotData = plotData.filter(d => d.country === filter.value);
        }

        const co2Extent = d3.extent(plotData, d => d.co2);
        const gdpExtent = d3.extent(plotData, d => d.gdp);
        
        xScale = isLogScale
            ? d3.scaleLog().domain(co2Extent).nice().range([0, width])
            : d3.scaleLinear().domain(co2Extent).nice().range([0, width]);
        yScale = isLogScale
            ? d3.scaleLog().domain(gdpExtent).nice().range([height, 0])
            : d3.scaleLinear().domain(gdpExtent).nice().range([height, 0]);

        sizeScale.domain(d3.extent(plotData, d => d.population)).nice();

        xAxis.transition().duration(500).call(
            d3.axisBottom(xScale)
        );

        yAxis.transition().duration(500).call(
            d3.axisLeft(yScale)
        );

        xAxisLabel.text(isLogScale ? "Log of CO₂ Emissions (Million tons)" : "CO₂ Emissions (Million tons)");
        yAxisLabel.text(isLogScale ? "Log of GDP (Billion USD)" : "GDP (Billion USD)");

        document.getElementById("scatterPlotTitle").innerText = 
            `CO₂ Emission vs GDP by ${filter ? filter.value : "Country"} in ${year} (${isLogScale ? "Log" : "Linear"} Scale)`;

        const circlesUpdate = circles.selectAll("circle")
            .data(plotData, d => d.country);

        circlesUpdate.exit().remove();

        circlesUpdate.enter().append("circle")
            .attr("cx", d => xScale(d.co2))
            .attr("cy", d => yScale(d.gdp))
            .attr("r", d => sizeScale(d.population))
            .attr("fill", d => regionColors[d.region])
            .attr("opacity", 0.6)
            .merge(circlesUpdate)
            .transition().duration(500)
            .attr("cx", d => xScale(d.co2))
            .attr("cy", d => yScale(d.gdp))
            .attr("r", d => sizeScale(d.population));

        circles.selectAll("circle")
            .on("mouseover", function (event, d) {
                d3.select(this).style("stroke", "#000").style("stroke-width", 2);
                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.country}</strong><br>CO₂: ${d3.format(",.2f")(d.co2)} Mtons<br>GDP: $${d3.format(",.2f")(d.gdp)}T<br>Population: ${d3.format(",")(d.population)}`)
                    .style("top", (event.pageY + 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mousemove", function (event) {
                tooltip.style("top", (event.pageY + 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                d3.select(this).style("stroke", "none");
                tooltip.style("visibility", "hidden");
            });

        brushLayer.call(brush.move, null); // Clear brush after update
    }

    updateScatterPlot(selectedYear);

    document.getElementById("toggleLog").addEventListener("click", function () {
        isLogScale = !isLogScale;
        this.innerText = isLogScale ? "Show Linear Scale" : "Show Log Scale";
        updateScatterPlot(selectedYear, selectedFilter);
    });

    window.updateScatterPlot = function(year, filter) {
        selectedFilter = filter;
        updateScatterPlot(year, filter);
    };
}

function createCO2CountryChart(data) {
    const margin = { top: 30, right: 120, bottom: 50, left: 80 },
        width = 800 - margin.left - margin.right,
        height = 400 - margin.top - margin.bottom;

    const svg = d3.select("#countryLineGraph").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const tooltip = d3.select("#lineTooltip");

    function updateCO2CountryChart(fullData, selectedCountries = null) {
        let topCountries;
        if (selectedCountries && selectedCountries.length > 0) {
            topCountries = selectedCountries;
        } else {
            topCountries = d3.rollups(
                fullData.filter(d => d.year == selectedYear),
                v => d3.sum(v, d => d.co2),
                d => d.country
            ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(d => d[0]);
        }

        const filteredData = fullData.filter(d => topCountries.includes(d.country));

        const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
            .domain(topCountries);

        const x = d3.scaleLinear()
            .domain(d3.extent(fullData, d => d.year))
            .nice()
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(filteredData, d => d.co2)])
            .nice()
            .range([height, 0]);

        const line = d3.line()
            .x(d => x(d.year))
            .y(d => y(d.co2));

        const countryData = d3.group(filteredData, d => d.country);

        const paths = svg.selectAll(".line-path")
            .data(countryData, d => d[0]);

        paths.exit().remove();

        paths.enter().append("path")
            .attr("class", "line-path")
            .merge(paths)
            .datum(d => d[1])
            .transition().duration(500)
            .attr("fill", "none")
            .attr("stroke", d => colorScale(d[0].country))
            .attr("stroke-width", 2)
            .attr("d", line);

        const circles = svg.selectAll(".data-point")
            .data(filteredData, d => `${d.country}-${d.year}`);

        circles.exit().remove();

        circles.enter().append("circle")
            .attr("class", "data-point")
            .attr("cx", d => x(d.year))
            .attr("cy", d => y(d.co2))
            .attr("r", 4)
            .attr("fill", d => colorScale(d.country))
            .attr("opacity", 0)
            .merge(circles)
            .transition().duration(500)
            .attr("cx", d => x(d.year))
            .attr("cy", d => y(d.co2));

        svg.selectAll(".data-point")
            .on("mouseover", function (event, d) {
                d3.select(this).attr("opacity", 1);
                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.country}</strong><br>Year: ${d.year}<br>CO₂: ${d3.format(",.2f")(d.co2)} Mtons`)
                    .style("top", (event.pageY + 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mousemove", function (event) {
                tooltip.style("top", (event.pageY + 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                d3.select(this).attr("opacity", 0);
                tooltip.style("visibility", "hidden");
            });

        svg.selectAll(".x-axis").remove();
        svg.append("g")
            .attr("class", "x-axis axis-value")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(d3.format("d")));

        svg.selectAll(".y-axis").remove();
        svg.append("g")
            .attr("class", "y-axis axis-value")
            .call(d3.axisLeft(y));

        addChartLabels(svg, width, height, "Year", "CO₂ Emissions (Million tons)");

        const legend = svg.selectAll(".legend").data([0]).join("g")
            .attr("class", "legend")
            .attr("transform", `translate(${width + 20}, 20)`);

        const legendItems = Array.from(countryData.keys());

        const legendRects = legend.selectAll("rect")
            .data(legendItems, d => d);

        legendRects.exit().remove();
        legendRects.enter().append("rect")
            .attr("x", 0)
            .attr("width", 15)
            .attr("height", 15)
            .merge(legendRects)
            .attr("y", (d, i) => i * 20)
            .attr("fill", d => colorScale(d));

        const legendTexts = legend.selectAll("text")
            .data(legendItems, d => d);

        legendTexts.exit().remove();
        legendTexts.enter().append("text")
            .attr("x", 20)
            .style("font-size", "12px")
            .merge(legendTexts)
            .attr("y", (d, i) => i * 20 + 12)
            .text(d => d);

        d3.select("#countryLineGraph h3").text(`CO₂ Emissions Over Time (${selectedYear} Selection)`);
    }

    updateCO2CountryChart(data);
    window.updateCO2CountryChart = updateCO2CountryChart;
}


// Function to Add X and Y Axis Labels
function addChartLabels(svg, width, height, xLabel, yLabel) {
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text(xLabel);

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -50)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text(yLabel);
}

//Function to create Sunburst Chart
function createSunburstChart(data) {
    const width = 600, height = 600, radius = Math.min(width, height) / 2;

    const tooltip = d3.select("#sunburstTooltip");

    const svg = d3.select("#sunburstChart").append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    let selectedFilter = null;

    function updateSunburstChart(year, selectedRegion = null) {
        selectedYear = year; // Sync with global year
        const filteredData = data.filter(d => d.year == year);
        const co2Hierarchy = d3.rollup(
            selectedRegion ? filteredData.filter(d => d.region === selectedRegion) : filteredData,
            v => d3.sum(v, d => d.co2),
            d => d.region,
            d => d["sub-region"],
            d => d.country
        );

        const hierarchyData = {
            name: selectedRegion || "World",
            children: Array.from(co2Hierarchy, ([region, subRegions]) => ({
                name: region,
                color: regionColors[region],
                children: Array.from(subRegions, ([subRegion, countries]) => ({
                    name: subRegion,
                    children: Array.from(countries, ([country, co2]) => ({
                        name: country,
                        value: co2
                    }))
                }))
            }))
        };

        const partition = d3.partition().size([2 * Math.PI, radius]);
        const root = d3.hierarchy(hierarchyData)
            .sum(d => d.value)
            .sort((a, b) => b.value - a.value);

        partition(root);

        function getAdjustedColor(regionColor, depth) {
            if (depth === 2) return d3.interpolateLab(regionColor, "#ffffff")(0.3);
            if (depth === 3) return d3.interpolateLab(regionColor, "#ffffff")(0.6);
            return regionColor;
        }

        const arc = d3.arc()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .innerRadius(d => d.y0)
            .outerRadius(d => d.y1);

        const paths = svg.selectAll("path")
            .data(root.descendants().filter(d => d.depth), d => d.data.name);

        paths.exit().remove();

        paths.enter().append("path")
            .merge(paths)
            .transition().duration(500)
            .attr("d", arc)
            .style("fill", d => {
                let baseColor = d.ancestors().find(a => a.depth === 1)?.data.color || "#ccc";
                return getAdjustedColor(baseColor, d.depth);
            })
            .style("stroke", "#fff");

        svg.selectAll("path")
            .on("mouseover", function (event, d) {
                d3.select(this).style("opacity", 0.7);
                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.data.name}</strong><br>CO₂: ${d3.format(",.2f")(d.value)} Mtons`)
                    .style("top", (event.pageY + 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mousemove", function (event) {
                tooltip.style("top", (event.pageY + 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                d3.select(this).style("opacity", 1);
                tooltip.style("visibility", "hidden");
            })
            .on("click", function (event, d) {
                const filterType = d.depth === 1 ? "region" : d.depth === 2 ? "sub-region" : "country";
                const filterValue = d.data.name;
                selectedFilter = (selectedFilter && selectedFilter.type === filterType && selectedFilter.value === filterValue)
                    ? null
                    : { type: filterType, value: filterValue };

                svg.selectAll("path")
                    .style("opacity", p => {
                        if (!selectedFilter) return 1;
                        if (selectedFilter.type === "region" && p.depth === 1 && p.data.name === selectedFilter.value) return 1;
                        if (selectedFilter.type === "sub-region" && p.depth === 2 && p.data.name === selectedFilter.value) return 1;
                        if (selectedFilter.type === "country" && p.depth === 3 && p.data.name === selectedFilter.value) return 1;
                        return 0.3;
                    });

                window.updateScatterPlot(selectedYear, selectedFilter);
            });

        svg.selectAll("text").remove();
        svg.selectAll("text")
            .data(root.descendants().filter(d => d.depth && (d.x1 - d.x0) > 0.1))
            .enter().append("text")
            .attr("transform", d => `translate(${arc.centroid(d)}) rotate(${computeTextRotation(d)})`)
            .attr("text-anchor", "middle")
            .attr("font-size", "11px")
            .attr("fill", "#000")
            .text(d => d.data.name);

        function computeTextRotation(d) {
            const angle = ((d.x0 + d.x1) / 2) * 180 / Math.PI - 90;
            return angle > 90 ? angle + 180 : angle;
        }

        d3.select("#sunburstChart h3").text(`Global CO₂ Emissions Structure: ${selectedRegion || "All Regions"} (${year})`);
    }

    updateSunburstChart(selectedYear);
    window.updateSunburstChart = updateSunburstChart;
}