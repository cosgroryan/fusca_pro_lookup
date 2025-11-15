// Advanced Metrics JavaScript

// Chart instances
let distChart = null;
let tsChart = null;
let regRsqChart = null;
let regCoefChart = null;

// Store regression data for export
let currentRegressionData = null;

// Helper function to detect mobile
function isMobile() {
    return window.innerWidth <= 768;
}

// Handle container resize to update charts (prevents continuous growth)
function setupChartResizeObserver() {
    const chartWrappers = document.querySelectorAll('.chart-wrapper');
    const resizeTimeouts = new Map(); // Track timeouts per wrapper
    
    chartWrappers.forEach(wrapper => {
        let lastWidth = 0;
        let lastHeight = 0;
        
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                const canvas = entry.target.querySelector('canvas');
                if (!canvas) continue;
                
                // Get the container's actual size
                const containerWidth = Math.floor(entry.contentRect.width);
                const containerHeight = Math.floor(entry.contentRect.height);
                
                // Skip if dimensions haven't changed meaningfully (prevents infinite loops)
                if (Math.abs(containerWidth - lastWidth) < 2 && Math.abs(containerHeight - lastHeight) < 2) {
                    continue;
                }
                
                lastWidth = containerWidth;
                lastHeight = containerHeight;
                
                // Clear any pending resize for this wrapper
                if (resizeTimeouts.has(wrapper)) {
                    clearTimeout(resizeTimeouts.get(wrapper));
                }
                
                // Debounce resize to prevent rapid updates during breakpoint transitions
                const timeoutId = setTimeout(() => {
                    // Explicitly set canvas size to match container
                    canvas.style.width = containerWidth + 'px';
                    canvas.style.height = containerHeight + 'px';
                    
                    // Find which chart this is and resize it
                    const chartId = canvas.id;
                    let chart = null;
                    
                    if (chartId === 'dist-chart' && distChart) {
                        chart = distChart;
                    } else if (chartId === 'ts-chart' && tsChart) {
                        chart = tsChart;
                    } else if (chartId === 'reg-chart-rsq' && regRsqChart) {
                        chart = regRsqChart;
                    } else if (chartId === 'reg-chart-coef' && regCoefChart) {
                        chart = regCoefChart;
                    }
                    
                    if (chart) {
                        // Use requestAnimationFrame to ensure DOM has updated
                        requestAnimationFrame(() => {
                            chart.resize();
                        });
                    }
                    
                    resizeTimeouts.delete(wrapper);
                }, 100); // 100ms debounce
                
                resizeTimeouts.set(wrapper, timeoutId);
            }
        });
        
        observer.observe(wrapper);
    });
}

// Tab switching
document.addEventListener('DOMContentLoaded', function() {
    // Setup chart resize observers
    setupChartResizeObserver();
    
    const tabs = document.querySelectorAll('.analysis-tab');
    const panels = document.querySelectorAll('.analysis-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Update active panel
            panels.forEach(p => p.classList.remove('active'));
            document.getElementById(`panel-${tabName}`).classList.add('active');
        });
    });
    
    // Benchmark period toggle
    document.getElementById('bench-period').addEventListener('change', function() {
        const customDates = document.getElementById('bench-custom-dates');
        if (this.value === 'custom') {
            customDates.style.display = 'grid';
        } else {
            customDates.style.display = 'none';
        }
    });
});

// ==================== DISTRIBUTION ANALYSIS ====================

async function runDistributionAnalysis() {
    setButtonLoading('dist-run-btn', true);
    const variable = document.getElementById('dist-variable').value;
    const startDate = document.getElementById('dist-start-date').value;
    const endDate = document.getElementById('dist-end-date').value;
    
    const loading = document.getElementById('loading');
    const errorMsg = document.getElementById('errorMsg');
    const resultsSection = document.getElementById('dist-results');
    
    loading.style.display = 'block';
    errorMsg.style.display = 'none';
    resultsSection.classList.remove('visible');
    
    const filters = {};
    if (startDate) filters.start_date = startDate;
    if (endDate) filters.end_date = endDate;
    
    try {
        const response = await fetch('/api/metrics/distribution', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                variable: variable,
                bin_size: variable === 'micron' ? 0.5 : 0.1,
                filters: filters
            })
        });
        
        const data = await response.json();
        loading.style.display = 'none';
        setButtonLoading('dist-run-btn', false);
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        // Display statistics
        const statsHtml = `
            <div class="stat-card"><div class="stat-label">Mean</div><div class="stat-value">${data.statistics.mean}</div></div>
            <div class="stat-card"><div class="stat-label">Median</div><div class="stat-value">${data.statistics.median}</div></div>
            <div class="stat-card"><div class="stat-label">Std Dev</div><div class="stat-value">${data.statistics.std_dev}</div></div>
            <div class="stat-card"><div class="stat-label">Min</div><div class="stat-value">${data.statistics.min}</div></div>
            <div class="stat-card"><div class="stat-label">Max</div><div class="stat-value">${data.statistics.max}</div></div>
            <div class="stat-card"><div class="stat-label">Count</div><div class="stat-value">${data.statistics.count.toLocaleString()}</div></div>
        `;
        document.getElementById('dist-stats').innerHTML = statsHtml;
        
        // Update title
        const variableNames = {
            'micron': 'Micron (μm)',
            'colour': 'Colour (Y-Z)',
            'vegetable_matter': 'Vegetable Matter (%)',
            'yield': 'Yield (%)'
        };
        document.getElementById('dist-results-title').textContent = `${variableNames[variable]} Distribution`;
        
        // Display histogram
        displayDistributionChart(data);
        
        // Generate insight
        const insight = generateDistributionInsight(variable, data);
        document.getElementById('dist-insight').innerHTML = `<strong>Insight:</strong><p>${insight}</p>`;
        
        resultsSection.classList.add('visible');
        
    } catch (error) {
        loading.style.display = 'none';
        setButtonLoading('dist-run-btn', false);
        showError('Failed to run distribution analysis: ' + error.message);
    }
}

function displayDistributionChart(data) {
    const ctx = document.getElementById('dist-chart').getContext('2d');
    
    if (distChart) {
        distChart.destroy();
    }
    
    const labels = data.histogram.map(h => `${h.bin_start}-${h.bin_end}`);
    const kgValues = data.histogram.map(h => h.kg);
    
    // Set canvas dimensions explicitly before creating chart
    const distWrapper = ctx.canvas.closest('.chart-wrapper');
    if (distWrapper) {
        const wrapperWidth = distWrapper.offsetWidth;
        const wrapperHeight = distWrapper.offsetHeight;
        ctx.canvas.style.width = wrapperWidth + 'px';
        ctx.canvas.style.height = wrapperHeight + 'px';
    }
    
    distChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (kg)',
                data: kgValues,
                backgroundColor: 'rgba(61, 127, 75, 0.7)',
                borderColor: '#3D7F4B',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,  // Always false to prevent continuous growth
            aspectRatio: undefined,  // Let container control dimensions
            layout: {
                padding: isMobile() ? {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                } : {
                    left: 5,
                    right: 5,
                    top: 5,
                    bottom: 5
                }
            },
            plugins: {
                legend: {display: false},
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Weight: ${context.parsed.y.toLocaleString()} kg`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Weight (kg)',
                        font: {size: isMobile() ? 10 : 12},
                        padding: isMobile() ? {left: 5, right: 5, top: 0, bottom: 0} : {left: 0, right: 0, top: 0, bottom: 0}
                    },
                    ticks: {
                        font: {size: isMobile() ? 8 : 10},
                        maxTicksLimit: isMobile() ? 5 : 10,
                        padding: isMobile() ? 4 : 8
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: data.variable,
                        font: {size: isMobile() ? 10 : 12},
                        padding: isMobile() ? {left: 0, right: 0, top: 5, bottom: 5} : {left: 0, right: 0, top: 0, bottom: 0}
                    },
                    ticks: {
                        font: {size: isMobile() ? 8 : 10},
                        maxRotation: isMobile() ? 45 : 0,
                        minRotation: isMobile() ? 45 : 0,
                        maxTicksLimit: isMobile() ? 8 : 20,
                        padding: isMobile() ? 4 : 8
                    }
                }
            }
        }
    });
}

function generateDistributionInsight(variable, data) {
    const stats = data.statistics;
    const skew = (stats.mean - stats.median) / stats.std_dev;
    
    let insight = `The ${variable} distribution shows a mean of ${stats.mean} and median of ${stats.median}. `;
    
    if (Math.abs(skew) < 0.1) {
        insight += `The distribution is roughly symmetric, indicating a balanced spread across the range.`;
    } else if (skew > 0.1) {
        insight += `The distribution is slightly skewed right (mean > median), with some higher values pulling the average up.`;
    } else {
        insight += `The distribution is slightly skewed left (mean < median), with some lower values pulling the average down.`;
    }
    
    return insight;
}

// ==================== TIME SERIES ANALYSIS ====================

async function runTimeseriesAnalysis() {
    setButtonLoading('ts-run-btn', true);
    const select = document.getElementById('ts-variables');
    const variables = Array.from(select.selectedOptions).map(opt => opt.value);
    const aggregation = document.getElementById('ts-aggregation').value;
    const startDate = document.getElementById('ts-start-date').value;
    const endDate = document.getElementById('ts-end-date').value;
    const minMicron = document.getElementById('ts-min-micron').value;
    const maxMicron = document.getElementById('ts-max-micron').value;
    
    if (variables.length === 0) {
        setButtonLoading('ts-run-btn', false);
        showError('Please select at least one variable');
        return;
    }
    
    const loading = document.getElementById('loading');
    const errorMsg = document.getElementById('errorMsg');
    const resultsSection = document.getElementById('ts-results');
    
    loading.style.display = 'block';
    errorMsg.style.display = 'none';
    resultsSection.classList.remove('visible');
    
    const filters = {};
    if (startDate) filters.start_date = startDate;
    if (endDate) filters.end_date = endDate;
    if (minMicron) filters.min_micron = parseFloat(minMicron);
    if (maxMicron) filters.max_micron = parseFloat(maxMicron);
    
    try {
        const response = await fetch('/api/metrics/timeseries', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                variables: variables,
                aggregation: aggregation,
                filters: filters
            })
        });
        
        const data = await response.json();
        loading.style.display = 'none';
        setButtonLoading('ts-run-btn', false);
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        // Display time series chart
        displayTimeseriesChart(data, variables);
        
        // Generate insight
        const insight = generateTimeseriesInsight(data, variables);
        document.getElementById('ts-insight').innerHTML = `<strong>Insight:</strong><p>${insight}</p>`;
        
        resultsSection.classList.add('visible');
        
    } catch (error) {
        loading.style.display = 'none';
        setButtonLoading('ts-run-btn', false);
        showError('Failed to run time series analysis: ' + error.message);
    }
}

function displayTimeseriesChart(data, variables) {
    const ctx = document.getElementById('ts-chart').getContext('2d');
    
    if (tsChart) {
        tsChart.destroy();
    }
    
    const colors = {
        'micron': '#1976D2',
        'colour': '#D32F2F',
        'vegetable_matter': '#F57C00',
        'yield': '#388E3C'
    };
    
    const variableNames = {
        'micron': 'Micron (μm)',
        'colour': 'Colour (Y-Z)',
        'vegetable_matter': 'VM (%)',
        'yield': 'Yield (%)'
    };
    
    // Create datasets with yAxisID assignments
    const datasets = variables.map((v, index) => {
        const series = data.series[v];
        const yAxisID = `y-axis-${index}`;  // Use more explicit ID format
        return {
            label: variableNames[v],
            data: series.values,
            borderColor: colors[v],
            backgroundColor: colors[v] + '20',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            yAxisID: yAxisID  // Assign each dataset to its own axis
        };
    });
    
    // Create scales configuration with multiple y-axes
    // Explicitly disable default 'y' axis and only use custom axes
    const mobile = isMobile();
    const scales = {
        x: {
            title: {
                display: true,
                text: `Time (${data.aggregation})`,
                font: {size: mobile ? 10 : 12},
                padding: mobile ? {left: 0, right: 0, top: 5, bottom: 5} : {left: 0, right: 0, top: 0, bottom: 0}
            },
            ticks: {
                font: {size: mobile ? 8 : 10},
                maxRotation: mobile ? 45 : 0,
                minRotation: mobile ? 45 : 0,
                maxTicksLimit: mobile ? 6 : 12,
                padding: mobile ? 4 : 8
            }
        },
        y: {
            display: false  // Disable default y-axis - we're using custom ones
        }
    };
    
    // Track which sides are used to avoid overcrowding
    let leftCount = 0;
    let rightCount = 0;
    
    // Add a y-axis for each variable, colored to match the series
    variables.forEach((v, index) => {
        const yAxisID = `y-axis-${index}`;
        // Alternate left/right, but limit to 2 per side if we have many variables
        let position;
        if (variables.length <= 2) {
            position = index % 2 === 0 ? 'left' : 'right';
        } else {
            // For 3+ variables, alternate but start with left
            position = index % 2 === 0 ? 'left' : 'right';
        }
        
        scales[yAxisID] = {
            type: 'linear',
            position: position,
            beginAtZero: false,
            title: {
                display: true,
                text: variableNames[v],
                color: colors[v],
                font: {weight: 'bold', size: mobile ? 10 : 12},
                padding: mobile ? {left: 5, right: 5, top: 0, bottom: 0} : {left: 0, right: 0, top: 0, bottom: 0}
            },
            ticks: {
                color: colors[v],
                font: {size: mobile ? 8 : 10},
                maxTicksLimit: mobile ? 5 : 10,
                padding: mobile ? 4 : 8
            },
            grid: {
                color: colors[v] + '30',  // Semi-transparent grid lines
                drawBorder: true,
                borderColor: colors[v],
                borderWidth: 2,
                lineWidth: 1
            },
            // Ensure independent scaling
            stacked: false
        };
    });
    
    // Set canvas dimensions explicitly before creating chart
    const tsWrapper = ctx.canvas.closest('.chart-wrapper');
    if (tsWrapper) {
        const wrapperWidth = tsWrapper.offsetWidth;
        const wrapperHeight = tsWrapper.offsetHeight;
        ctx.canvas.style.width = wrapperWidth + 'px';
        ctx.canvas.style.height = wrapperHeight + 'px';
    }
    
    tsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.series[variables[0]].labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,  // Always false to prevent continuous growth
            aspectRatio: undefined,  // Let container control dimensions
            layout: {
                padding: mobile ? {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                } : {
                    left: 5,
                    right: 5,
                    top: 5,
                    bottom: 5
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: scales
        }
    });
}

function generateTimeseriesInsight(data, variables) {
    return `Showing ${data.aggregation} trends for ${variables.length} variable(s) over time. Look for seasonal patterns (main shear vs lambs), structural shifts, and long-term trends that could indicate changing clip profiles or market conditions.`;
}

// ==================== REGRESSION ANALYSIS ====================

async function runRegressionAnalysis() {
    setButtonLoading('reg-run-btn', true);
    const startDate = document.getElementById('reg-start-date').value;
    const endDate = document.getElementById('reg-end-date').value;
    const smoothWindow = parseInt(document.getElementById('reg-smooth').value);
    const minMicron = document.getElementById('reg-min-micron').value;
    const maxMicron = document.getElementById('reg-max-micron').value;
    
    const loading = document.getElementById('loading');
    const errorMsg = document.getElementById('errorMsg');
    const resultsSection = document.getElementById('reg-results');
    
    loading.style.display = 'block';
    errorMsg.style.display = 'none';
    resultsSection.classList.remove('visible');
    
    const filters = {};
    if (startDate) filters.start_date = startDate;
    if (endDate) filters.end_date = endDate;
    if (minMicron) filters.min_micron = parseFloat(minMicron);
    if (maxMicron) filters.max_micron = parseFloat(maxMicron);
    
    try {
        const response = await fetch('/api/metrics/regression', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                filters: filters,
                smooth_window: smoothWindow
            })
        });
        
        const data = await response.json();
        loading.style.display = 'none';
        setButtonLoading('reg-run-btn', false);
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        // Display summary statistics
        const statsHtml = `
            <div class="stat-card">
                <div class="stat-label">Weeks Analysed</div>
                <div class="stat-value">${data.summary.weeks_analyzed}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Adj R²</div>
                <div class="stat-value">${(data.summary.avg_r_squared * 100).toFixed(1)}%</div>
            </div>
        `;
        document.getElementById('reg-stats').innerHTML = statsHtml;
        
        // Display charts
        displayRegressionCharts(data);
        
        // Generate insight
        const insight = generateRegressionInsight(data);
        document.getElementById('reg-insight').innerHTML = `<strong>Insight:</strong><p>${insight}</p>`;
        
        resultsSection.classList.add('visible');
        
    } catch (error) {
        loading.style.display = 'none';
        setButtonLoading('reg-run-btn', false);
        showError('Failed to run regression analysis: ' + error.message);
    }
}

function displayRegressionCharts(data) {
    // Store data for export
    currentRegressionData = data;
    
    // R-squared chart
    const ctxRsq = document.getElementById('reg-chart-rsq').getContext('2d');
    
    if (regRsqChart) {
        regRsqChart.destroy();
    }
    
    const weeks = data.weekly_results.map(r => r.week);
    const rsquared = data.weekly_results.map(r => r.adj_r_squared);
    
    // Set canvas dimensions explicitly before creating chart
    const rsqWrapper = ctxRsq.canvas.closest('.chart-wrapper');
    if (rsqWrapper) {
        const wrapperWidth = rsqWrapper.offsetWidth;
        const wrapperHeight = rsqWrapper.offsetHeight;
        ctxRsq.canvas.style.width = wrapperWidth + 'px';
        ctxRsq.canvas.style.height = wrapperHeight + 'px';
    }
    
    regRsqChart = new Chart(ctxRsq, {
        type: 'line',
        data: {
            labels: weeks,
            datasets: [{
                label: 'Adjusted R²',
                data: rsquared,
                borderColor: '#1976D2',
                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,  // Always false to prevent continuous growth
            aspectRatio: undefined,  // Let container control dimensions
            layout: {
                padding: isMobile() ? {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                } : {
                    left: 5,
                    right: 5,
                    top: 5,
                    bottom: 5
                }
            },
            plugins: {
                legend: {display: false}
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 1,
                    title: {
                        display: true,
                        text: 'Adjusted R²',
                        font: {size: isMobile() ? 10 : 12},
                        padding: isMobile() ? {left: 5, right: 5, top: 0, bottom: 0} : {left: 0, right: 0, top: 0, bottom: 0}
                    },
                    ticks: {
                        font: {size: isMobile() ? 8 : 10},
                        maxTicksLimit: isMobile() ? 5 : 10,
                        padding: isMobile() ? 4 : 8
                    }
                },
                x: {
                    display: false
                }
            }
        }
    });
    
    // Coefficients chart
    const ctxCoef = document.getElementById('reg-chart-coef').getContext('2d');
    
    if (regCoefChart) {
        regCoefChart.destroy();
    }
    
    const micronCoef = data.weekly_results.map(r => r.coefficients.micron_smoothed || r.coefficients.micron);
    const colourCoef = data.weekly_results.map(r => r.coefficients.colour_smoothed || r.coefficients.colour);
    const lengthCoef = data.weekly_results.map(r => r.coefficients.length_index_smoothed || r.coefficients.length_index);
    const vmCoef = data.weekly_results.map(r => r.coefficients.vegetable_matter_smoothed || r.coefficients.vegetable_matter);
    
    // Set canvas dimensions explicitly before creating chart
    const coefWrapper = ctxCoef.canvas.closest('.chart-wrapper');
    if (coefWrapper) {
        const wrapperWidth = coefWrapper.offsetWidth;
        const wrapperHeight = coefWrapper.offsetHeight;
        ctxCoef.canvas.style.width = wrapperWidth + 'px';
        ctxCoef.canvas.style.height = wrapperHeight + 'px';
    }
    
    regCoefChart = new Chart(ctxCoef, {
        type: 'line',
        data: {
            labels: weeks,
            datasets: [
                {label: 'Micron', data: micronCoef, borderColor: '#1976D2', borderWidth: 2, fill: false},
                {label: 'Colour', data: colourCoef, borderColor: '#D32F2F', borderWidth: 2, fill: false},
                {label: 'Length', data: lengthCoef, borderColor: '#388E3C', borderWidth: 2, fill: false},
                {label: 'VM', data: vmCoef, borderColor: '#F57C00', borderWidth: 2, fill: false}
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,  // Always false to prevent continuous growth
            aspectRatio: undefined,  // Let container control dimensions
            layout: {
                padding: isMobile() ? {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                } : {
                    left: 5,
                    right: 5,
                    top: 5,
                    bottom: 5
                }
            },
            plugins: {
                legend: {display: true, position: 'top'}
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Coefficient (cents per unit)',
                        font: {size: isMobile() ? 10 : 12},
                        padding: isMobile() ? {left: 5, right: 5, top: 0, bottom: 0} : {left: 0, right: 0, top: 0, bottom: 0}
                    },
                    ticks: {
                        font: {size: isMobile() ? 8 : 10},
                        maxTicksLimit: isMobile() ? 5 : 10,
                        padding: isMobile() ? 4 : 8
                    }
                },
                x: {
                    display: false
                }
            }
        }
    });
}

// Export regression to PDF
async function exportRegressionPDF() {
    if (!currentRegressionData) {
        alert('No regression data available. Please run regression analysis first.');
        return;
    }
    
    await downloadRegressionPDF(currentRegressionData);
}

function generateRegressionInsight(data) {
    const avgR2 = data.summary.avg_r_squared;
    const recentWeek = data.weekly_results[data.weekly_results.length - 1];
    const recentCoef = recentWeek.coefficients;
    
    let insight = `The model explains ${(avgR2 * 100).toFixed(1)}% of price variation on average. `;
    
    // Identify strongest driver
    const drivers = [
        {name: 'colour', value: Math.abs(recentCoef.colour)},
        {name: 'micron', value: Math.abs(recentCoef.micron)},
        {name: 'VM', value: Math.abs(recentCoef.vegetable_matter)},
        {name: 'length', value: Math.abs(recentCoef.length_index)}
    ];
    drivers.sort((a, b) => b.value - a.value);
    
    insight += `Currently, ${drivers[0].name} is the strongest price driver, followed by ${drivers[1].name}. `;
    insight += `Lower colour Y-Z and VM percentages command premiums, while length and micron effects vary by market demand.`;
    
    return insight;
}

// ==================== SCENARIO ANALYSIS ====================

async function runScenarioAnalysis() {
    setButtonLoading('scenario-run-btn', true);
    // Helper function to convert letter to index
    const letterToIndex = (letter) => {
        if (!letter) return 4; // Default to D
        return letter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0) + 1;
    };
    
    const baseline = {
        micron: document.getElementById('base-micron').value,
        colour: document.getElementById('base-colour').value,
        length: document.getElementById('base-length').value,
        vegetable_matter: document.getElementById('base-vm').value
    };
    
    const scenario = {
        micron: document.getElementById('scenario-micron').value,
        colour: document.getElementById('scenario-colour').value,
        length: document.getElementById('scenario-length').value,
        vegetable_matter: document.getElementById('scenario-vm').value
    };
    
    // Validate all fields are filled
    if (!baseline.micron || !baseline.colour || !baseline.length || !baseline.vegetable_matter ||
        !scenario.micron || !scenario.colour || !scenario.length || !scenario.vegetable_matter) {
        showError('Please fill in all fields for both baseline and scenario');
        setButtonLoading('scenario-run-btn', false);
        return;
    }
    
    const baselineParsed = {
        micron: parseFloat(baseline.micron),
        colour: parseFloat(baseline.colour),
        length_index: letterToIndex(baseline.length),
        vegetable_matter: parseFloat(baseline.vegetable_matter)
    };
    
    const scenarioParsed = {
        micron: parseFloat(scenario.micron),
        colour: parseFloat(scenario.colour),
        length_index: letterToIndex(scenario.length),
        vegetable_matter: parseFloat(scenario.vegetable_matter)
    };
    
    const loading = document.getElementById('loading');
    const errorMsg = document.getElementById('errorMsg');
    const resultsSection = document.getElementById('scenario-results');
    
    loading.style.display = 'block';
    errorMsg.style.display = 'none';
    resultsSection.classList.remove('visible');
    
    try {
        const response = await fetch('/api/metrics/scenario', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({baseline: baselineParsed, scenario: scenarioParsed})
        });
        
        const data = await response.json();
        loading.style.display = 'none';
        setButtonLoading('scenario-run-btn', false);
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        // Display impact
        const impactHtml = `
            <div class="big-number">${data.price_change_cents > 0 ? '+' : ''}${data.price_change_cents} ¢/kg</div>
            <div class="label">${data.price_change_cents > 0 ? '+' : ''}$${data.price_change_dollars}/kg</div>
        `;
        document.getElementById('scenario-impact').innerHTML = impactHtml;
        
        // Display breakdown
        const breakdown = data.impact_breakdown;
        const breakdownHtml = `
            <div class="breakdown-item"><span class="factor">Micron Change:</span><span class="value">${breakdown.micron > 0 ? '+' : ''}${breakdown.micron}¢</span></div>
            <div class="breakdown-item"><span class="factor">Colour Change:</span><span class="value">${breakdown.colour > 0 ? '+' : ''}${breakdown.colour}¢</span></div>
            <div class="breakdown-item"><span class="factor">Length Change:</span><span class="value">${breakdown.length_index > 0 ? '+' : ''}${breakdown.length_index}¢</span></div>
            <div class="breakdown-item"><span class="factor">VM Change:</span><span class="value">${breakdown.vegetable_matter > 0 ? '+' : ''}${breakdown.vegetable_matter}¢</span></div>
        `;
        document.getElementById('scenario-breakdown').innerHTML = breakdownHtml;
        
        // Generate insight
        const insight = generateScenarioInsight(data);
        document.getElementById('scenario-insight').innerHTML = `<strong>Insight:</strong><p>${insight}</p>`;
        
        resultsSection.classList.add('visible');
        
    } catch (error) {
        loading.style.display = 'none';
        setButtonLoading('scenario-run-btn', false);
        showError('Failed to run scenario analysis: ' + error.message);
    }
}

function generateScenarioInsight(data) {
    const change = data.price_change_cents;
    const breakdown = data.impact_breakdown;
    
    // Find biggest contributor
    const contributors = [
        {name: 'colour', value: breakdown.colour},
        {name: 'micron', value: breakdown.micron},
        {name: 'VM', value: breakdown.vegetable_matter},
        {name: 'length', value: breakdown.length_index}
    ];
    contributors.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    
    let insight = `Your scenario shows a ${change > 0 ? 'premium' : 'discount'} of ${Math.abs(change)}¢/kg ($${Math.abs(data.price_change_dollars)}/kg). `;
    insight += `The biggest driver is ${contributors[0].name} (${contributors[0].value > 0 ? '+' : ''}${contributors[0].value}¢/kg). `;
    
    if (change > 0) {
        insight += `This improvement could be worth significant value per bale, especially if you're processing large volumes.`;
    } else {
        insight += `Consider addressing ${contributors[0].name} first to minimize this discount.`;
    }
    
    return insight;
}

// ==================== BENCHMARK ANALYSIS ====================

async function runBenchmarkAnalysis() {
    setButtonLoading('bench-run-btn', true);
    const timePeriod = document.getElementById('bench-period').value;
    const startDate = document.getElementById('bench-start-date').value;
    const endDate = document.getElementById('bench-end-date').value;
    const micron = document.getElementById('bench-micron').value;
    const colour = document.getElementById('bench-colour').value;
    const vm = document.getElementById('bench-vm').value;
    const length = document.getElementById('bench-length').value;
    
    const loading = document.getElementById('loading');
    const errorMsg = document.getElementById('errorMsg');
    const resultsSection = document.getElementById('bench-results');
    
    loading.style.display = 'block';
    errorMsg.style.display = 'none';
    resultsSection.classList.remove('visible');
    
    const payload = {time_period: timePeriod};
    
    if (timePeriod === 'custom') {
        if (!startDate) {
            loading.style.display = 'none';
            setButtonLoading('bench-run-btn', false);
            showError('Please select a start date for custom range');
            return;
        }
        payload.start_date = startDate;
        payload.end_date = endDate;
    }
    
    const specs = {};
    if (micron) specs.micron = parseFloat(micron);
    if (colour) specs.colour = parseFloat(colour);
    if (vm) specs.vegetable_matter = parseFloat(vm);
    if (length) specs.length = length.toUpperCase();  // Send as letter, backend will convert
    
    payload.specs = specs;
    
    try {
        const response = await fetch('/api/metrics/benchmark', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        loading.style.display = 'none';
        setButtonLoading('bench-run-btn', false);
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        // Display national statistics
        const stats = data.national_stats;
        const avgPriceDollars = (stats.price.mean / 100).toFixed(2);
        const medianPriceDollars = (stats.price.median / 100).toFixed(2);
        const statsHtml = `
            <div class="stat-card"><div class="stat-label">Avg Price</div><div class="stat-value">$${avgPriceDollars}/kg</div></div>
            <div class="stat-card"><div class="stat-label">Median Price</div><div class="stat-value">$${medianPriceDollars}/kg</div></div>
            <div class="stat-card"><div class="stat-label">Avg Micron</div><div class="stat-value">${stats.micron.mean}μm</div></div>
            <div class="stat-card"><div class="stat-label">Avg Colour</div><div class="stat-value">${stats.colour.mean}</div></div>
            <div class="stat-card"><div class="stat-label">Avg VM</div><div class="stat-value">${stats.vegetable_matter.mean}%</div></div>
            <div class="stat-card"><div class="stat-label">Total Lots</div><div class="stat-value">${data.n_lots.toLocaleString()}</div></div>
        `;
        document.getElementById('bench-stats').innerHTML = statsHtml;
        
        // Display percentiles if lot specs provided
        if (Object.keys(data.lot_ranking).length > 0) {
            const percentileHtml = generatePercentileBars(data.lot_ranking);
            document.getElementById('bench-percentiles').innerHTML = percentileHtml;
        } else {
            document.getElementById('bench-percentiles').innerHTML = '<p style="font-size: 12px; color: #666; margin-top: 16px;">Enter your lot specs above to see how you rank against the national average.</p>';
        }
        
        // Generate insight
        const insight = generateBenchmarkInsight(data);
        document.getElementById('bench-insight').innerHTML = `<strong>Insight:</strong><p>${insight}</p>`;
        
        resultsSection.classList.add('visible');
        
    } catch (error) {
        loading.style.display = 'none';
        setButtonLoading('bench-run-btn', false);
        showError('Failed to run benchmark analysis: ' + error.message);
    }
}

function getGradientForPercentile(percentile) {
    // Higher percentile = better for all metrics
    // Good (70-100%): Green gradient
    // Average (30-70%): Yellow/orange gradient  
    // Bad (0-30%): Red gradient
    if (percentile >= 70) {
        // Good: Green gradient
        return 'linear-gradient(90deg, #3D7F4B 0%, #28a745 100%)';
    } else if (percentile >= 30) {
        // Average: Yellow to orange
        return 'linear-gradient(90deg, #ffc107 0%, #ff9800 100%)';
    } else {
        // Bad: Red gradient
        return 'linear-gradient(90deg, #dc3545 0%, #c82333 100%)';
    }
}

function generatePercentileBars(ranking) {
    let html = '<div style="margin-top: 20px;"><h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: #153D33;">Your Lot Percentile Rankings</h4>';
    
    // Helper function to generate a single percentile bar
    function createPercentileBar(label, percentile) {
        const barWidthPercent = Math.max(percentile, 15); // Minimum 15% for label visibility
        const gradient = getGradientForPercentile(percentile);
        const labelText = `${percentile.toFixed(1)}th %ile`;
        return `
            <div class="benchmark-percentile">
                <div class="percentile-label">${label}</div>
                <div class="percentile-bar-container">
                    <div class="percentile-bar" style="width: ${percentile}%; background: ${gradient};">
                        <div class="percentile-value">${labelText}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (ranking.micron_percentile !== undefined) {
        html += createPercentileBar('Micron', ranking.micron_percentile);
    }
    
    if (ranking.colour_percentile !== undefined) {
        html += createPercentileBar('Colour (better)', ranking.colour_percentile);
    }
    
    if (ranking.length_percentile !== undefined) {
        html += createPercentileBar('Length (longer)', ranking.length_percentile);
    }
    
    if (ranking.vm_percentile !== undefined) {
        html += createPercentileBar('VM (cleaner)', ranking.vm_percentile);
    }
    
    html += '</div>';
    return html;
}

function generateBenchmarkInsight(data) {
    const stats = data.national_stats;
    const ranking = data.lot_ranking;
    
    let insight = `Based on ${data.n_lots.toLocaleString()} lots from the ${data.time_period} period, the national average is ${stats.price.mean}¢/kg (median ${stats.price.median}¢/kg). `;
    
    if (Object.keys(ranking).length > 0) {
        const avgPercentile = Object.values(ranking).reduce((a, b) => a + b, 0) / Object.values(ranking).length;
        
        if (avgPercentile >= 75) {
            insight += `Your lot ranks in the top quarter across measured traits - you're producing premium wool that should command strong prices.`;
        } else if (avgPercentile >= 50) {
            insight += `Your lot ranks above average, indicating solid wool quality. Focus on the lower-ranking traits to move into the premium tier.`;
        } else if (avgPercentile >= 25) {
            insight += `Your lot ranks around the national average. There's opportunity to improve value through better colour management, VM control, or clip preparation.`;
        } else {
            insight += `Your lot ranks below average on some traits. Consider investing in better preparation, timing, or handling to capture more value at auction.`;
        }
    } else {
        insight += `Enter your lot specifications above to see how you compare to the national benchmark.`;
    }
    
    return insight;
}

// Error handling
function showError(message) {
    const errorMsg = document.getElementById('errorMsg');
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    setTimeout(() => {
        errorMsg.style.display = 'none';
    }, 5000);
}

// Button disable/enable functions
function setButtonLoading(buttonId, isLoading) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.disabled = isLoading;
        if (isLoading) {
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    }
}

// Clear form functions
function clearDistributionForm() {
    document.getElementById('dist-variable').value = 'micron';
    document.getElementById('dist-start-date').value = '';
    document.getElementById('dist-end-date').value = '';
    document.getElementById('dist-results').classList.remove('visible');
}

function clearTimeseriesForm() {
    document.getElementById('ts-variables').selectedIndex = 0;
    document.getElementById('ts-aggregation').value = 'monthly';
    document.getElementById('ts-start-date').value = '2012-07-01';
    document.getElementById('ts-end-date').value = '';
    document.getElementById('ts-min-micron').value = '';
    document.getElementById('ts-max-micron').value = '';
    document.getElementById('ts-results').classList.remove('visible');
}

function clearRegressionForm() {
    document.getElementById('reg-start-date').value = '2012-07-01';
    document.getElementById('reg-end-date').value = '';
    document.getElementById('reg-min-micron').value = '';
    document.getElementById('reg-max-micron').value = '';
    document.getElementById('reg-smooth').value = '5';
    document.getElementById('reg-results').classList.remove('visible');
}

function clearScenarioForm() {
    document.getElementById('base-micron').value = '36';
    document.getElementById('base-colour').value = '3.0';
    document.getElementById('base-length').value = 'D';
    document.getElementById('base-vm').value = '0.3';
    document.getElementById('scenario-micron').value = '36';
    document.getElementById('scenario-colour').value = '2.0';
    document.getElementById('scenario-length').value = 'D';
    document.getElementById('scenario-vm').value = '0.1';
    document.getElementById('scenario-results').classList.remove('visible');
}

function clearBenchmarkForm() {
    document.getElementById('bench-period').value = 'recent';
    document.getElementById('bench-custom-dates').style.display = 'none';
    document.getElementById('bench-start-date').value = '';
    document.getElementById('bench-end-date').value = '';
    document.getElementById('bench-micron').value = '';
    document.getElementById('bench-colour').value = '';
    document.getElementById('bench-vm').value = '';
    document.getElementById('bench-length').value = '';
    document.getElementById('bench-results').classList.remove('visible');
}

