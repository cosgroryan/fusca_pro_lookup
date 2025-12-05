// Advanced Blends JavaScript

let compareChart = null;
let blendDateFilter = null;
let currentChartData = null;
let currentEntries = null;
let currentWeights = null;
let isBlending = false;
let currentBlendViewMode = 'graph'; // 'graph' or 'table'
let currentBlendTableData = null;

// Parse wool types input, handling parentheses for groups
function parseWoolTypeEntries(input) {
    const entries = [];
    let current = '';
    let inGroup = false;
    
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        
        if (char === '(') {
            inGroup = true;
            current = '';
        } else if (char === ')') {
            inGroup = false;
            const types = current.split(',').map(t => t.trim()).filter(t => t);
            if (types.length > 0) {
                entries.push({
                    types: types,
                    label: '(' + types.join(' + ') + ')',
                    isGroup: true
                });
            }
            current = '';
        } else if (char === ',' && !inGroup) {
            const type = current.trim();
            if (type) {
                entries.push({
                    types: [type],
                    label: type,
                    isGroup: false
                });
            }
            current = '';
        } else {
            current += char;
        }
    }
    
    if (current.trim()) {
        const type = current.trim();
        entries.push({
            types: [type],
            label: type,
            isGroup: false
        });
    }
    
    return entries;
}

function setupBlend() {
    const input = document.getElementById('compareTypes').value.trim();
    
    if (!input) {
        alert('Please enter wool types first');
        return;
    }
    
    const entries = parseWoolTypeEntries(input);
    if (entries.length === 0) {
        alert('Please enter valid wool types');
        return;
    }
    
    if (entries.length > 5) {
        alert('Maximum 5 entries for blending');
        return;
    }
    
    const section = document.getElementById('blendModeSection');
    section.style.display = 'block';
    populateBlendWeights(entries);
}

function resetBlend() {
    // Clear input
    document.getElementById('compareTypes').value = '';
    
    // Hide blend mode section
    const section = document.getElementById('blendModeSection');
    section.style.display = 'none';
    
    // Clear blend weights
    const container = document.getElementById('blendWeights');
    container.innerHTML = '';
    
    // Hide chart section
    const chartSection = document.getElementById('compareChartSection');
    chartSection.style.display = 'none';
    
    // Destroy chart if exists
    if (compareChart) {
        compareChart.destroy();
        compareChart = null;
    }
    
    // Reset date filter
    blendDateFilter = null;
    currentChartData = null;
    currentEntries = null;
    currentWeights = null;
    
    // Reset date range buttons
    document.querySelectorAll('.date-range-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Hide custom date range
    const customDateRange = document.getElementById('customDateRange');
    if (customDateRange) {
        customDateRange.style.display = 'none';
    }
}

function populateBlendWeights(entries) {
    const container = document.getElementById('blendWeights');
    container.innerHTML = '';
    
    entries.forEach((entry, idx) => {
        const div = document.createElement('div');
        div.className = 'blend-item';
        div.innerHTML = `
            <div class="blend-item-header">
                <label>${entry.label}:</label>
                <input type="number" id="weight_${idx}" value="1" min="0" step="0.1" />
                <span style="color: #666; font-size: 13px;">weight</span>
            </div>
            <div class="blend-filters">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 13px; color: #666;">Custom filters for ${entry.label}:</span>
                    <button class="add-blend-filter-btn" onclick="addBlendFilter(${idx})" style="width: fit-content; margin-left: auto;">+ Add Filter</button>
                </div>
                <div id="blend_filters_${idx}"></div>
            </div>
        `;
        container.appendChild(div);
    });
}

function addBlendFilter(typeIdx) {
    const container = document.getElementById(`blend_filters_${typeIdx}`);
    const filterId = `blend_${typeIdx}_${Date.now()}`;
    
    const filterRow = document.createElement('div');
    filterRow.className = 'blend-filter-row';
    filterRow.id = filterId;
    filterRow.setAttribute('data-type-idx', typeIdx);
    filterRow.innerHTML = `
        <button class="remove-blend-filter-btn" onclick="removeBlendFilter('${filterId}')" title="Remove filter">✕</button>
        <select class="blend-filter-column">
            <option value="">Select Column</option>
            ${columns.filter(c => c.name !== 'sale_date').map(col => 
                `<option value="${col.name}" data-type="${col.type}">${col.label}</option>`
            ).join('')}
        </select>
        <select class="blend-filter-operator">
            <option value="">Operator</option>
            <option value="gt">></option>
            <option value="lt"><</option>
            <option value="gte">>=</option>
            <option value="lte"><=</option>
            <option value="eq">=</option>
            <option value="between">Between</option>
        </select>
        <input type="text" class="blend-filter-value" placeholder="Value" />
        <input type="text" class="blend-filter-value2" placeholder="Value 2" style="display:none;" />
        <button class="apply-to-all-btn" onclick="applyFilterToAll('${filterId}', ${typeIdx})" title="Apply this filter to all types">
            APPLY TO ALL
        </button>
    `;
    
    const operatorSelect = filterRow.querySelector('.blend-filter-operator');
    operatorSelect.onchange = function() {
        const value2 = filterRow.querySelector('.blend-filter-value2');
        value2.style.display = this.value === 'between' ? 'inline-block' : 'none';
    };
    
    container.appendChild(filterRow);
}

function applyFilterToAll(filterId, sourceTypeIdx) {
    const sourceRow = document.getElementById(filterId);
    if (!sourceRow) return;
    
    const column = sourceRow.querySelector('.blend-filter-column').value;
    const operator = sourceRow.querySelector('.blend-filter-operator').value;
    const value = sourceRow.querySelector('.blend-filter-value').value;
    const value2 = sourceRow.querySelector('.blend-filter-value2').value;
    
    if (!column || !operator || !value) {
        alert('Please fill in all filter fields first');
        return;
    }
    
    const input = document.getElementById('compareTypes').value.trim();
    const entries = parseWoolTypeEntries(input);
    
    entries.forEach((entry, idx) => {
        if (idx !== sourceTypeIdx) {
            const container = document.getElementById(`blend_filters_${idx}`);
            const existingRows = container.querySelectorAll('.blend-filter-row');
            let foundExisting = false;
            
            existingRows.forEach(row => {
                const existingColumn = row.querySelector('.blend-filter-column').value;
                if (existingColumn === column) {
                    row.querySelector('.blend-filter-operator').value = operator;
                    row.querySelector('.blend-filter-value').value = value;
                    
                    if (operator === 'between' && value2) {
                        row.querySelector('.blend-filter-value2').value = value2;
                        row.querySelector('.blend-filter-value2').style.display = 'inline-block';
                    } else {
                        row.querySelector('.blend-filter-value2').style.display = 'none';
                    }
                    
                    foundExisting = true;
                }
            });
            
            if (!foundExisting) {
                addBlendFilter(idx);
                const newRow = container.lastElementChild;
                
                newRow.querySelector('.blend-filter-column').value = column;
                newRow.querySelector('.blend-filter-operator').value = operator;
                newRow.querySelector('.blend-filter-value').value = value;
                
                if (operator === 'between' && value2) {
                    newRow.querySelector('.blend-filter-value2').value = value2;
                    newRow.querySelector('.blend-filter-value2').style.display = 'inline-block';
                }
            }
        }
    });
}

function removeBlendFilter(filterId) {
    document.getElementById(filterId).remove();
}

function setDateRange(range) {
    if (isPostOperationInProgress()) {
        console.log('Operation in progress, cannot change date range');
        return;
    }
    
    document.querySelectorAll('.date-range-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('customDateRange').classList.remove('show');
    
    if (range === 'all') {
        blendDateFilter = null;
    } else {
        blendDateFilter = getDateRangeFilter(range);
    }
    
    // Auto-trigger blend if already set up
    const blendSection = document.getElementById('blendModeSection');
    if (blendSection && blendSection.style.display !== 'none') {
        applyBlendedCompare();
    }
}

function toggleCustomDateRange() {
    const customSection = document.getElementById('customDateRange');
    document.querySelectorAll('.date-range-btn').forEach(btn => btn.classList.remove('active'));
    
    if (!customSection.classList.contains('show')) {
        customSection.classList.add('show');
        event.target.classList.add('active');
    } else {
        customSection.classList.remove('show');
    }
}

function applyCustomDateRange() {
    if (isPostOperationInProgress()) {
        console.log('Operation in progress, cannot change date range');
        return;
    }
    
    const fromDate = document.getElementById('customDateFrom').value;
    const toDate = document.getElementById('customDateTo').value;
    
    if (!fromDate || !toDate) {
        alert('Please select both dates');
        return;
    }
    
    blendDateFilter = {
        column: 'sale_date',
        operator: 'between',
        value: fromDate,
        value2: toDate
    };
    
    // Auto-trigger blend if already set up
    const blendSection = document.getElementById('blendModeSection');
    if (blendSection && blendSection.style.display !== 'none') {
        applyBlendedCompare();
    }
}

async function applyBlendedCompare() {
    // Prevent concurrent blends
    if (isBlending || isPostOperationInProgress()) {
        console.log('Blend already in progress, skipping...');
        return;
    }
    
    isBlending = true;
    disablePostButtons();
    
    const input = document.getElementById('compareTypes').value.trim();
    const entries = parseWoolTypeEntries(input);
    
    const weights = [];
    entries.forEach((entry, idx) => {
        const weight = parseFloat(document.getElementById(`weight_${idx}`).value) || 1;
        weights.push(weight);
    });
    
    const entryFilters = [];
    entries.forEach((entry, idx) => {
        const filters = [];
        const container = document.getElementById(`blend_filters_${idx}`);
        if (container) {
            container.querySelectorAll('.blend-filter-row').forEach(row => {
                const column = row.querySelector('.blend-filter-column').value;
                const operator = row.querySelector('.blend-filter-operator').value;
                const value = row.querySelector('.blend-filter-value').value;
                const value2 = row.querySelector('.blend-filter-value2').value;
                
                if (column && operator && value) {
                    filters.push({ column, operator, value, value2: operator === 'between' ? value2 : null });
                }
            });
        }
        entryFilters.push(filters);
    });
    
    if (!blendDateFilter) {
        const proceed = confirm(
            '⚠️ No date range selected!\n\n' +
            'This query may take 10-30 seconds.\n\n' +
            'Continue anyway?'
        );
        if (!proceed) {
            isBlending = false;
            enablePostButtons();
            return;
        }
    }
    
    document.getElementById('compareChartSection').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    try {
        const response = await fetch('/api/compare_chart_blend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entries: entries.map((entry, idx) => ({
                    types: entry.types,
                    label: entry.label,
                    filters: entryFilters[idx],
                    weight: weights[idx]
                })),
                date_filter: blendDateFilter
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        displayBlendedChart(data, entries, weights);
        
    } catch (error) {
        console.error('Blend error:', error);
        showError('Blend failed: ' + error.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
        isBlending = false;
        enablePostButtons();
    }
}

function displayBlendedChart(data, entries, weights) {
    document.getElementById('compareChartSection').style.display = 'block';
    
    // Store for MA updates and table view
    currentChartData = data;
    currentEntries = entries;
    currentWeights = weights;
    currentBlendTableData = data.table_data || {};
    
    // Ensure views are in correct state
    const graphView = document.getElementById('blendGraphView');
    const tableView = document.getElementById('blendTableView');
    if (graphView && tableView) {
        if (currentBlendViewMode === 'table') {
            graphView.style.display = 'none';
            tableView.style.display = 'block';
            displayBlendTable();
        } else {
            graphView.style.display = 'block';
            tableView.style.display = 'none';
            updateChart();
        }
    } else {
        // Fallback - just update chart if views don't exist yet
        updateChart();
    }
}

// Toggle between graph and table view
function toggleBlendView(mode) {
    currentBlendViewMode = mode;
    
    const graphBtn = document.getElementById('viewToggleGraph');
    const tableBtn = document.getElementById('viewToggleTable');
    const graphView = document.getElementById('blendGraphView');
    const tableView = document.getElementById('blendTableView');
    
    if (graphBtn && tableBtn) {
        graphBtn.classList.remove('active');
        tableBtn.classList.remove('active');
        
        if (mode === 'graph') {
            graphBtn.classList.add('active');
            graphView.style.display = 'block';
            tableView.style.display = 'none';
            if (currentChartData && currentEntries && currentWeights) {
                updateChart();
            }
        } else {
            tableBtn.classList.add('active');
            graphView.style.display = 'none';
            tableView.style.display = 'block';
            if (currentBlendTableData) {
                displayBlendTable();
            }
        }
    }
}

function updateChart() {
    if (!currentChartData || !currentEntries || !currentWeights) return;
    
    const ctx = document.getElementById('compareChart').getContext('2d');
    
    if (compareChart) {
        compareChart.destroy();
    }
    
    const interpolatedDatasets = currentChartData.datasets.map(dataset => ({
        ...dataset,
        data: interpolateDataset(dataset.data)
    }));
    
    const blendedData = [];
    const labels = currentChartData.labels;
    
    for (let i = 0; i < labels.length; i++) {
        let weightedSum = 0;
        let totalWeight = 0;
        
        interpolatedDatasets.forEach((dataset, idx) => {
            const value = dataset.data[i];
            if (value !== null && value !== undefined) {
                weightedSum += value * currentWeights[idx];
                totalWeight += currentWeights[idx];
            }
        });
        
        blendedData.push(totalWeight > 0 ? weightedSum / totalWeight : null);
    }
    
    const colors = ['#3D7F4B', '#1976D2', '#D32F2F', '#F57C00', '#7B1FA2'];
    const datasets = [];
    
    // Individual entry lines (20% opacity)
    interpolatedDatasets.forEach((dataset, idx) => {
        datasets.push({
            label: currentEntries[idx].label + ` (weight: ${currentWeights[idx]})`,
            data: dataset.data,
            borderColor: colors[idx % colors.length] + '33',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            tension: 0.1,
            fill: false,
            spanGaps: false,
            pointRadius: 0,
            order: 2
        });
    });
    
    // Blended average line (bold, green)
    datasets.push({
        label: '✨ Weighted Average',
        data: blendedData,
        borderColor: '#3D7F4B',
        backgroundColor: 'rgba(61, 127, 75, 0.1)',
        borderWidth: 3,
        tension: 0.1,
        fill: true,
        spanGaps: true,
        pointRadius: 2,
        pointBackgroundColor: '#3D7F4B',
        order: 1
    });
    
    compareChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            if (value === null) return null;
                            return context.dataset.label + ': $' + value.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Average Price ($)' },
                    ticks: { callback: function(value) { return '$' + value; } }
                },
                x: {
                    title: { display: true, text: 'Sale Date' },
                    ticks: { maxRotation: 45, minRotation: 45, maxTicksLimit: 20 }
                }
            }
        }
    });
}

async function saveBlendSearch() {
    const input = document.getElementById('compareTypes').value.trim();
    const entries = parseWoolTypeEntries(input);
    
    if (entries.length === 0) {
        alert('Please set up a blend first');
        return;
    }
    
    const name = prompt('Enter a name for this blend:');
    if (!name) return;
    
    const weights = [];
    entries.forEach((entry, idx) => {
        const weight = parseFloat(document.getElementById(`weight_${idx}`).value) || 1;
        weights.push(weight);
    });
    
    const entryFilters = [];
    entries.forEach((entry, idx) => {
        const filters = [];
        const container = document.getElementById(`blend_filters_${idx}`);
        if (container) {
            container.querySelectorAll('.blend-filter-row').forEach(row => {
                const column = row.querySelector('.blend-filter-column').value;
                const operator = row.querySelector('.blend-filter-operator').value;
                const value = row.querySelector('.blend-filter-value').value;
                const value2 = row.querySelector('.blend-filter-value2').value;
                
                if (column && operator && value) {
                    filters.push({ column, operator, value, value2 });
                }
            });
        }
        entryFilters.push(filters);
    });
    
    let savedSearches = JSON.parse(localStorage.getItem('fusca_saved_searches') || '[]');
    
    savedSearches.push({
        id: Date.now(),
        name: name,
        type: 'blend',
        page: 'blends',
        inputString: input,
        entries: entries,
        weights: weights,
        entryFilters: entryFilters,
        dateFilter: blendDateFilter,
        created: new Date().toISOString()
    });
    
    localStorage.setItem('fusca_saved_searches', JSON.stringify(savedSearches));
    
    try {
        await fetch('/api/log_saved_search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: name, 
                type: 'blend',
                blend_data: { inputString: input, entries, weights, entryFilters, dateFilter: blendDateFilter }
            })
        });
    } catch (e) {
        console.warn('Failed to log blend:', e);
    }
    
    renderSavedSearches();
    alert(`Blend "${name}" saved successfully!`);
}

function loadSavedSearch(searchId) {
    if (isPostOperationInProgress()) {
        console.log('Operation in progress, cannot load saved search');
        return;
    }
    
    const savedSearches = JSON.parse(localStorage.getItem('fusca_saved_searches') || '[]');
    const savedSearch = savedSearches.find(s => s.id === searchId);
    
    if (!savedSearch || savedSearch.page !== 'blends') return;
    
    blendDateFilter = savedSearch.dateFilter;
    
    const inputString = savedSearch.inputString || '';
    document.getElementById('compareTypes').value = inputString;
    
    const entries = parseWoolTypeEntries(inputString);
    
    const section = document.getElementById('blendModeSection');
    section.style.display = 'block';
    
    populateBlendWeights(entries);
    
    entries.forEach((entry, idx) => {
        if (savedSearch.weights[idx] !== undefined) {
            document.getElementById(`weight_${idx}`).value = savedSearch.weights[idx];
        }
    });
    
    const filtersToLoad = savedSearch.entryFilters || [];
    entries.forEach((entry, idx) => {
        if (filtersToLoad[idx]) {
            filtersToLoad[idx].forEach(filter => {
                addBlendFilter(idx);
                const container = document.getElementById(`blend_filters_${idx}`);
                const lastRow = container.lastElementChild;
                lastRow.querySelector('.blend-filter-column').value = filter.column;
                lastRow.querySelector('.blend-filter-operator').value = filter.operator;
                lastRow.querySelector('.blend-filter-value').value = filter.value;
                if (filter.value2 && filter.operator === 'between') {
                    lastRow.querySelector('.blend-filter-value2').value = filter.value2;
                    lastRow.querySelector('.blend-filter-value2').style.display = 'inline-block';
                }
            });
        }
    });
    
    applyBlendedCompare();
}

function deleteSavedSearch(searchId) {
    if (!confirm('Delete this saved blend?')) return;
    
    let savedSearches = JSON.parse(localStorage.getItem('fusca_saved_searches') || '[]');
    savedSearches = savedSearches.filter(s => s.id !== searchId);
    localStorage.setItem('fusca_saved_searches', JSON.stringify(savedSearches));
    
    renderSavedSearches();
}

function renderSavedSearches() {
    const savedSearches = JSON.parse(localStorage.getItem('fusca_saved_searches') || '[]');
    const blendSearches = savedSearches.filter(s => s.page === 'blends' || s.type === 'blend');
    const container = document.getElementById('savedSearchesList');
    const section = document.getElementById('savedSearchesSection');
    
    if (blendSearches.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    container.innerHTML = '';
    
    blendSearches.forEach(search => {
        const item = document.createElement('div');
        item.className = 'saved-search-item blend';
        item.innerHTML = `
            <span onclick="loadSavedSearch(${search.id})">✨ ${search.name}</span>
            <span class="delete-btn" onclick="event.stopPropagation(); deleteSavedSearch(${search.id})">✕</span>
        `;
        container.appendChild(item);
    });
}

function displayBlendTable() {
    const tbody = document.getElementById('blendTableBody');
    if (!tbody || !currentBlendTableData || !currentEntries || !currentWeights) return;
    
    tbody.innerHTML = '';
    
    // Get all unique dates from all entries
    const allDates = new Set();
    Object.values(currentBlendTableData).forEach(seriesData => {
        Object.keys(seriesData).forEach(date => allDates.add(date));
    });
    const sortedDates = Array.from(allDates).sort().reverse(); // Most recent first
    
    sortedDates.forEach(date => {
        // Calculate blended metrics for this date
        let blendedPrice = null;
        let blendedColour = null;
        let blendedVm = null;
        let blendedVolume = 0;
        
        let weightedPriceSum = 0;
        let totalWeight = 0;
        let totalColourWeight = 0;
        let totalColourVolume = 0;
        let totalVmWeight = 0;
        let totalVmVolume = 0;
        
        // Calculate weighted blend
        currentEntries.forEach((entry, idx) => {
            const entryData = currentBlendTableData[entry.label];
            if (!entryData) return;
            
            const dateData = entryData[date];
            if (!dateData || typeof dateData !== 'object' || !dateData.price) return;
            
            const weight = currentWeights[idx] || 1;
            weightedPriceSum += dateData.price * weight;
            totalWeight += weight;
            
            // Aggregate colour and VM with volume weighting
            if (dateData.avg_colour !== null && dateData.avg_colour !== undefined && dateData.total_volume > 0) {
                totalColourWeight += dateData.avg_colour * dateData.total_volume;
                totalColourVolume += dateData.total_volume;
            }
            
            if (dateData.avg_vm !== null && dateData.avg_vm !== undefined && dateData.total_volume > 0) {
                totalVmWeight += dateData.avg_vm * dateData.total_volume;
                totalVmVolume += dateData.total_volume;
            }
            
            blendedVolume += dateData.total_volume || 0;
        });
        
        if (totalWeight > 0) {
            blendedPrice = weightedPriceSum / totalWeight;
        }
        if (totalColourVolume > 0) {
            blendedColour = totalColourWeight / totalColourVolume;
        }
        if (totalVmVolume > 0) {
            blendedVm = totalVmWeight / totalVmVolume;
        }
        
        // Add blend row (green text)
        const blendRow = document.createElement('tr');
        blendRow.style.backgroundColor = '#f0f8f0';
        blendRow.innerHTML = `
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600;">${date}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600; color: #3D7F4B;">✨ Blended Average</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600; color: #3D7F4B;">-</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600; color: #3D7F4B;">$${blendedPrice !== null ? blendedPrice.toFixed(2) : '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600; color: #3D7F4B;">${blendedColour !== null && blendedColour !== undefined ? blendedColour.toFixed(2) : '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600; color: #3D7F4B;">${blendedVm !== null && blendedVm !== undefined ? blendedVm.toFixed(2) : '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600; color: #3D7F4B;">${blendedVolume.toLocaleString()}</td>
        `;
        tbody.appendChild(blendRow);
        
        // Add component rows
        currentEntries.forEach((entry, idx) => {
            const entryData = currentBlendTableData[entry.label];
            if (!entryData) return;
            
            const dateData = entryData[date];
            if (!dateData || typeof dateData !== 'object' || !dateData.price) return;
            
            const weight = currentWeights[idx] || 1;
            const componentRow = document.createElement('tr');
            componentRow.innerHTML = `
                <td style="padding: 8px; border: 1px solid #ddd;"></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${entry.label}</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600;">${weight}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">$${dateData.price !== null && dateData.price !== undefined ? dateData.price.toFixed(2) : '-'}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${dateData.avg_colour !== null && dateData.avg_colour !== undefined ? dateData.avg_colour.toFixed(2) : '-'}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${dateData.avg_vm !== null && dateData.avg_vm !== undefined ? dateData.avg_vm.toFixed(2) : '-'}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${(dateData.total_volume || 0).toLocaleString()}</td>
            `;
            tbody.appendChild(componentRow);
        });
    });
}

function exportBlendTableToCSV() {
    if (!currentBlendTableData || !currentEntries || !currentWeights) {
        alert('No data to export');
        return;
    }
    
    // Build CSV content
    const headers = ['Date', 'Type', 'Weight', 'Avg Price ($)', 'Avg Colour', 'Avg VM', 'Total Volume (Bales)'];
    const rows = [];
    
    // Get all unique dates
    const allDates = new Set();
    Object.values(currentBlendTableData).forEach(seriesData => {
        Object.keys(seriesData).forEach(date => allDates.add(date));
    });
    const sortedDates = Array.from(allDates).sort().reverse();
    
    sortedDates.forEach(date => {
        // Calculate blended metrics
        let blendedPrice = null;
        let blendedColour = null;
        let blendedVm = null;
        let blendedVolume = 0;
        
        let weightedPriceSum = 0;
        let totalWeight = 0;
        let totalColourWeight = 0;
        let totalColourVolume = 0;
        let totalVmWeight = 0;
        let totalVmVolume = 0;
        
        currentEntries.forEach((entry, idx) => {
            const entryData = currentBlendTableData[entry.label];
            if (!entryData) return;
            
            const dateData = entryData[date];
            if (!dateData || typeof dateData !== 'object' || !dateData.price) return;
            
            const weight = currentWeights[idx] || 1;
            weightedPriceSum += dateData.price * weight;
            totalWeight += weight;
            
            if (dateData.avg_colour !== null && dateData.avg_colour !== undefined && dateData.total_volume > 0) {
                totalColourWeight += dateData.avg_colour * dateData.total_volume;
                totalColourVolume += dateData.total_volume;
            }
            
            if (dateData.avg_vm !== null && dateData.avg_vm !== undefined && dateData.total_volume > 0) {
                totalVmWeight += dateData.avg_vm * dateData.total_volume;
                totalVmVolume += dateData.total_volume;
            }
            
            blendedVolume += dateData.total_volume || 0;
        });
        
        if (totalWeight > 0) {
            blendedPrice = weightedPriceSum / totalWeight;
        }
        if (totalColourVolume > 0) {
            blendedColour = totalColourWeight / totalColourVolume;
        }
        if (totalVmVolume > 0) {
            blendedVm = totalVmWeight / totalVmVolume;
        }
        
        // Add blend row
        rows.push([
            date,
            '✨ Blended Average',
            '',
            blendedPrice !== null ? blendedPrice.toFixed(2) : '',
            blendedColour !== null && blendedColour !== undefined ? blendedColour.toFixed(2) : '',
            blendedVm !== null && blendedVm !== undefined ? blendedVm.toFixed(2) : '',
            blendedVolume.toString()
        ]);
        
        // Add component rows
        currentEntries.forEach((entry, idx) => {
            const entryData = currentBlendTableData[entry.label];
            if (!entryData) return;
            
            const dateData = entryData[date];
            if (!dateData || typeof dateData !== 'object' || !dateData.price) return;
            
            const weight = currentWeights[idx] || 1;
            rows.push([
                '',
                entry.label,
                weight.toString(),
                dateData.price !== null && dateData.price !== undefined ? dateData.price.toFixed(2) : '',
                dateData.avg_colour !== null && dateData.avg_colour !== undefined ? dateData.avg_colour.toFixed(2) : '',
                dateData.avg_vm !== null && dateData.avg_vm !== undefined ? dateData.avg_vm.toFixed(2) : '',
                (dateData.total_volume || 0).toString()
            ]);
        });
    });
    
    // Build CSV content
    const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    const now = new Date();
    const timestamp = now.toISOString().split('T')[0];
    link.setAttribute('download', `blend_data_${timestamp}.csv`);
    
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return '"' + stringValue.replace(/"/g, '""') + '"';
    }
    return stringValue;
}

function showError(message) {
    const errorDiv = document.getElementById('errorMsg');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

console.log('Advanced blends ready');
renderSavedSearches();

