// Export Data Analysis JavaScript

let exportChart = null;
let availableFiles = [];
let availableCountries = [];
let currentData = null;
let currentSummary = null;
let chartDisplayMode = 'value'; // 'value', 'volume', or 'both'
let categoryMode = 'combine'; // 'combine' or 'compare'
let dateRange = { min: null, max: null }; // Store min/max dates from available files
let isSettingDateProgrammatically = false; // Flag to prevent auto-switch when setting dates programmatically

// Chart colors for value/volume display
const VOLUME_COLOR = 'rgba(21, 61, 51, 1)'; // Dark green for volume/quantity
const VALUE_COLOR = 'rgba(0, 102, 204, 1)'; // Blue for value (more contrasting)

// Wool categories mapping
const WOOL_CATEGORIES = {
    'greasy_fine': 'Greasy Wool - Fine (< 24.5μm)',
    'greasy_medium': 'Greasy Wool - Medium (24.5-31.4μm)',
    'greasy_coarse': 'Greasy Wool - Coarse (31.4-35.4μm)',
    'greasy_very_coarse': 'Greasy Wool - Very Coarse (> 35.4μm)',
    'degreased_fine': 'Degreased Wool - Fine (< 24.5μm)',
    'degreased_medium': 'Degreased Wool - Medium (24.5-31.4μm)',
    'degreased_coarse': 'Degreased Wool - Coarse (31.4-35.4μm)',
    'degreased_very_coarse': 'Degreased Wool - Very Coarse (> 35.4μm)',
    'carded': 'Carded Wool',
    'combed': 'Combed Wool / Tops',
    'yarn_carpet': 'Yarn for Carpet (85%+ wool)',
    'yarn_85plus': 'Yarn (85%+ wool)',
    'yarn_less85': 'Yarn (<85% wool)'
};

// Render wool category selector
function renderWoolCategorySelector() {
    const container = document.getElementById('woolCategorySelector');
    if (!container) return;
    
    let html = '';
    Object.keys(WOOL_CATEGORIES).forEach(category => {
        const categoryId = `category_${category}`;
        html += `
            <div class="wool-category-checkbox">
                <input type="checkbox" id="${categoryId}" value="${category}">
                <label for="${categoryId}">${WOOL_CATEGORIES[category]}</label>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Select all greasy wool categories
function selectAllGreasy() {
    const greasyCategories = ['greasy_fine', 'greasy_medium', 'greasy_coarse', 'greasy_very_coarse'];
    greasyCategories.forEach(category => {
        const checkbox = document.getElementById(`category_${category}`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
}

// Select all scoured/degreased wool categories
function selectAllScoured() {
    const scouredCategories = ['degreased_fine', 'degreased_medium', 'degreased_coarse', 'degreased_very_coarse'];
    scouredCategories.forEach(category => {
        const checkbox = document.getElementById(`category_${category}`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
}

// Category selection helpers
function selectAllCategories() {
    document.querySelectorAll('#woolCategorySelector input[type="checkbox"]').forEach(cb => cb.checked = true);
}

function deselectAllCategories() {
    document.querySelectorAll('#woolCategorySelector input[type="checkbox"]').forEach(cb => cb.checked = false);
}

// Category mode toggle (combine vs compare)
function toggleCategoryMode(mode) {
    categoryMode = mode;
    
    // Update button states
    const combineBtn = document.getElementById('categoryToggleCombine');
    const compareBtn = document.getElementById('categoryToggleCompare');
    
    if (combineBtn && compareBtn) {
        if (mode === 'combine') {
            combineBtn.classList.add('active');
            compareBtn.classList.remove('active');
        } else {
            compareBtn.classList.add('active');
            combineBtn.classList.remove('active');
        }
    }
    
    // Redraw chart if data exists
    if (currentData && exportChart) {
        displayChart(currentData, document.getElementById('groupBy').value);
    }
}

// Quick date range selector
function setQuickDateRange(range) {
    if (!dateRange.min || !dateRange.max) {
        showError('Date range not loaded yet. Please wait...');
        return;
    }
    
    const endDate = parseInt(dateRange.max);
    const endYear = Math.floor(endDate / 100);
    const endMonth = endDate % 100;
    
    let startDate;
    
    switch(range) {
        case '6m':
            // 6 months ago
            let startMonth = endMonth - 5;
            let startYear = endYear;
            if (startMonth <= 0) {
                startMonth += 12;
                startYear -= 1;
            }
            startDate = startYear * 100 + startMonth;
            break;
        case '1y':
            // 1 year ago
            startDate = (endYear - 1) * 100 + endMonth;
            break;
        case '3y':
            // 3 years ago
            startDate = (endYear - 3) * 100 + endMonth;
            break;
        case 'all':
            // All time
            startDate = parseInt(dateRange.min);
            break;
        default:
            return;
    }
    
    // Ensure start date is not before min
    const minDate = parseInt(dateRange.min);
    if (startDate < minDate) {
        startDate = minDate;
    }
    
    // Set flag to prevent auto-switch
    isSettingDateProgrammatically = true;
    document.getElementById('startDate').value = startDate.toString();
    document.getElementById('endDate').value = dateRange.max;
    isSettingDateProgrammatically = false;
    
    // Update active button
    updateDateRangeButton(range);
}

// Update active date range button
function updateDateRangeButton(range) {
    document.querySelectorAll('.date-range-buttons button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (range === 'custom') {
        const customBtn = document.getElementById('customDateBtn');
        if (customBtn) customBtn.classList.add('active');
    } else {
        // Find button by onclick attribute
        const buttons = document.querySelectorAll('.date-range-buttons button');
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick') === `setQuickDateRange('${range}')`) {
                btn.classList.add('active');
            }
        });
    }
}

// Set custom date range (with animation)
function setCustomDateRange() {
    // Update active button
    updateDateRangeButton('custom');
    
    // Flash the date input fields green
    flashDateInputs();
}

// Flash date input fields green
function flashDateInputs() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (!startDateInput || !endDateInput) return;
    
    // Store original border color
    const originalStartBorder = window.getComputedStyle(startDateInput).borderColor;
    const originalEndBorder = window.getComputedStyle(endDateInput).borderColor;
    
    // Flash 3 times (6 total flashes: on/off x 3)
    let flashCount = 0;
    const maxFlashes = 6; // 3 flashes = 6 state changes (on/off)
    
    function flash() {
        if (flashCount >= maxFlashes) {
            // Restore original border
            startDateInput.style.transition = '';
            endDateInput.style.transition = '';
            startDateInput.style.borderColor = originalStartBorder;
            endDateInput.style.borderColor = originalEndBorder;
            return;
        }
        
        // Toggle green border
        const isOn = flashCount % 2 === 0;
        startDateInput.style.transition = 'border-color 0.3s ease';
        endDateInput.style.transition = 'border-color 0.3s ease';
        
        if (isOn) {
            startDateInput.style.borderColor = '#3D7F4B';
            endDateInput.style.borderColor = '#3D7F4B';
        } else {
            startDateInput.style.borderColor = originalStartBorder;
            endDateInput.style.borderColor = originalEndBorder;
        }
        
        flashCount++;
        
        // Wait before next state change
        setTimeout(flash, 300);
    }
    
    flash();
}

// Chart display toggle
function toggleChartDisplay(mode) {
    chartDisplayMode = mode;
    
    // Update button states
    const valueBtn = document.getElementById('chartToggleValue');
    const volumeBtn = document.getElementById('chartToggleVolume');
    const bothBtn = document.getElementById('chartToggleBoth');
    
    if (valueBtn && volumeBtn && bothBtn) {
        // Remove active from all
        valueBtn.classList.remove('active');
        volumeBtn.classList.remove('active');
        bothBtn.classList.remove('active');
        
        // Add active to selected
        if (mode === 'value') {
            valueBtn.classList.add('active');
        } else if (mode === 'volume') {
            volumeBtn.classList.add('active');
        } else if (mode === 'both') {
            bothBtn.classList.add('active');
        }
    }
    
    // Redraw chart if data exists
    if (currentData && exportChart) {
        displayChart(currentData, document.getElementById('groupBy').value);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded. Please ensure Chart.js is included in the page.');
        showError('Chart library not loaded. Please refresh the page.');
        return;
    }
    
    loadAvailableFiles().then(() => {
        // Pre-fill date fields with min/max dates
        if (dateRange.min && dateRange.max) {
            isSettingDateProgrammatically = true;
            document.getElementById('startDate').value = dateRange.min;
            document.getElementById('endDate').value = dateRange.max;
            isSettingDateProgrammatically = false;
            // Set "All Time" as active since we're pre-filling with full range
            updateDateRangeButton('all');
        }
    });
    loadCountries();
    renderWoolCategorySelector();
    
    // Add event listeners to date inputs to auto-switch to custom
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (startDateInput) {
        startDateInput.addEventListener('input', function() {
            // Only auto-switch if user is typing (not programmatic)
            if (!isSettingDateProgrammatically && this.value && this.value.length > 0) {
                // Auto-switch to custom without animation
                updateDateRangeButton('custom');
            }
        });
    }
    
    if (endDateInput) {
        endDateInput.addEventListener('input', function() {
            // Only auto-switch if user is typing (not programmatic)
            if (!isSettingDateProgrammatically && this.value && this.value.length > 0) {
                // Auto-switch to custom without animation
                updateDateRangeButton('custom');
            }
        });
    }
});

// Load available files and determine date range
async function loadAvailableFiles() {
    try {
        const response = await fetch('/api/export-data/files');
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        availableFiles = data.files || [];
        
        // Determine min and max dates
        if (availableFiles.length > 0) {
            const dates = availableFiles.map(f => {
                const dateKey = f.date_key;
                if (dateKey.length === 4) {
                    // Yearly file - use first and last month of year
                    return { min: parseInt(dateKey + '01'), max: parseInt(dateKey + '12') };
                } else {
                    // Monthly file
                    return { min: parseInt(dateKey), max: parseInt(dateKey) };
                }
            });
            
            dateRange.min = Math.min(...dates.map(d => d.min)).toString();
            dateRange.max = Math.max(...dates.map(d => d.max)).toString();
        }
    } catch (error) {
        console.error('Error loading files:', error);
        showError('Failed to load available files');
    }
}

// Format date for display (like quick date buttons)
function formatDateDisplay(dateKey) {
    if (!dateKey) return '';
    
    const str = dateKey.toString();
    if (str.length === 4) {
        // Yearly: "2024"
        return str;
    } else if (str.length === 6) {
        // Monthly: "202501" -> "Jan 2025"
        const year = str.substring(0, 4);
        const month = parseInt(str.substring(4, 6));
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[month - 1]} ${year}`;
    }
    return dateKey;
}

// Load countries
async function loadCountries() {
    try {
        const response = await fetch('/api/export-data/countries');
        const data = await response.json();
        
        if (data.error) {
            console.error('Error loading countries:', data.error);
            return;
        }
        
        availableCountries = data.countries || [];
        renderCountrySelector();
    } catch (error) {
        console.error('Error loading countries:', error);
    }
}

// Render country selector
function renderCountrySelector() {
    const select = document.getElementById('countryFilter');
    if (!select) return;
    
    select.innerHTML = '<option value="">All Countries</option>';
    availableCountries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
    });
}


// Clear filters
function clearFilters() {
    // Reset to default date range
    if (dateRange.min && dateRange.max) {
        document.getElementById('startDate').value = dateRange.min;
        document.getElementById('endDate').value = dateRange.max;
    }
    document.getElementById('countryFilter').selectedIndex = 0;
    document.getElementById('groupBy').selectedIndex = 0;
    deselectAllCategories(); // Reset to all categories deselected
    toggleChartDisplay('value'); // Reset to value display
    toggleCategoryMode('combine'); // Reset to combine mode
    document.getElementById('resultsSection').classList.remove('visible');
    document.getElementById('provisionalWarning').classList.remove('show');
    
    // Disable CSV export button
    const exportCSVBtn = document.getElementById('exportCSVBtn');
    if (exportCSVBtn) {
        exportCSVBtn.disabled = true;
    }
    
    // Clear quick date button active states
    document.querySelectorAll('.date-range-buttons button').forEach(btn => {
        btn.classList.remove('active');
    });
}

// Get files needed for date range
function getFilesForDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
        return availableFiles.map(f => f.filename);
    }
    
    const start = parseInt(startDate);
    const end = parseInt(endDate);
    
    const neededFiles = [];
    
    availableFiles.forEach(file => {
        const dateKey = file.date_key;
        
        if (file.type === 'yearly') {
            // Yearly file covers all months in that year
            const year = parseInt(dateKey);
            const yearStart = year * 100 + 1;
            const yearEnd = year * 100 + 12;
            
            // Include if year overlaps with date range
            if (yearStart <= end && yearEnd >= start) {
                neededFiles.push(file.filename);
            }
        } else {
            // Monthly file
            const month = parseInt(dateKey);
            
            // Include if month is within range
            if (month >= start && month <= end) {
                neededFiles.push(file.filename);
            }
        }
    });
    
    return neededFiles;
}

// Load export data
async function loadExportData() {
    const loadBtn = document.getElementById('loadBtn');
    const loading = document.getElementById('loading');
    const errorMsg = document.getElementById('errorMsg');
    
    // Get filters
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const countryFilter = document.getElementById('countryFilter');
    const selectedCountries = Array.from(countryFilter.selectedOptions)
        .map(opt => opt.value)
        .filter(v => v !== '');
    const groupBy = document.getElementById('groupBy').value;
    
    // Get selected wool categories
    const selectedCategories = Array.from(document.querySelectorAll('#woolCategorySelector input[type="checkbox"]:checked'))
        .map(cb => cb.value);
    
    if (selectedCategories.length === 0) {
        showError('Please select at least one wool category');
        return;
    }
    
    // Validate date format
    if (!startDate || !endDate) {
        showError('Please select both start and end dates');
        return;
    }
    
    if (!/^\d{6}$/.test(startDate)) {
        showError('Start date must be in YYYYMM format (e.g., 202401)');
        return;
    }
    
    if (!/^\d{6}$/.test(endDate)) {
        showError('End date must be in YYYYMM format (e.g., 202412)');
        return;
    }
    
    const dateRangeArray = [parseInt(startDate), parseInt(endDate)];
    
    // Get files needed for this date range
    const selectedFiles = getFilesForDateRange(startDate, endDate);
    
    if (selectedFiles.length === 0) {
        showError('No data files available for the selected date range');
        return;
    }
    
    // Show loading
    loadBtn.disabled = true;
    loading.style.display = 'block';
    errorMsg.style.display = 'none';
    hideError();
    
    try {
        let data;
        let fullData;
        
        // Determine if we need raw data:
        // 1. Compare mode with multiple categories
        // 2. Multiple countries selected (always show as separate series)
        // 3. Both multiple countries and multiple categories (show combinations)
        const needsRawData = (categoryMode === 'compare' && selectedCategories.length > 1) || 
                             (selectedCountries.length > 1) ||
                             (selectedCountries.length > 1 && selectedCategories.length > 1);
        
        if (needsRawData) {
            // Load raw data for compare mode or multiple countries
            const rawResponse = await fetch('/api/export-data/load', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filenames: selectedFiles,
                    wool_only: true,
                    date_range: dateRangeArray,
                    countries: selectedCountries.length > 0 ? selectedCountries : null,
                    wool_categories: selectedCategories
                })
            });
            
            fullData = await rawResponse.json();
            
            if (fullData.error) {
                showError(fullData.error);
                return;
            }
            
            // Use raw data for charting
            data = { data: fullData.data };
            currentSummary = fullData.summary;
        } else {
            // Load aggregated data for combine mode
            const response = await fetch('/api/export-data/aggregate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filenames: selectedFiles,
                    wool_only: true,
                    date_range: dateRangeArray,
                    countries: selectedCountries.length > 0 ? selectedCountries : null,
                    wool_categories: selectedCategories,
                    group_by: groupBy
                })
            });
            
            data = await response.json();
            
            if (data.error) {
                showError(data.error);
                return;
            }
            
            // Also load full data for summary
            const fullResponse = await fetch('/api/export-data/load', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filenames: selectedFiles,
                    wool_only: true,
                    date_range: dateRangeArray,
                    countries: selectedCountries.length > 0 ? selectedCountries : null,
                    wool_categories: selectedCategories
                })
            });
            
            fullData = await fullResponse.json();
            
            if (fullData.error) {
                showError(fullData.error);
                return;
            }
            
            currentSummary = fullData.summary;
        }
        
        currentData = data.data;
        
        // Check for provisional data
        if (currentSummary && currentSummary.has_provisional) {
            document.getElementById('provisionalWarning').classList.add('show');
        } else {
            document.getElementById('provisionalWarning').classList.remove('show');
        }
        
        // Display results
        displayResults(data.data, groupBy, fullData.summary);
        
        // Enable CSV export button
        const exportCSVBtn = document.getElementById('exportCSVBtn');
        if (exportCSVBtn) {
            exportCSVBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('Error loading export data:', error);
        showError('Failed to load export data: ' + error.message);
    } finally {
        loadBtn.disabled = false;
        loading.style.display = 'none';
    }
}

// Display results
function displayResults(data, groupBy, summary) {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.classList.add('visible');
    
    // Display summary stats
    displaySummaryStats(summary);
    
    // Display chart
    displayChart(data, groupBy);
}

// Display summary statistics
function displaySummaryStats(summary) {
    const container = document.getElementById('summaryStats');
    if (!container || !summary) return;
    
    const formatCurrency = (value) => {
        if (value >= 1000000) {
            return '$' + (value / 1000000).toFixed(2) + 'M';
        } else if (value >= 1000) {
            return '$' + (value / 1000).toFixed(2) + 'K';
        }
        return '$' + value.toFixed(0);
    };
    
    const formatNumber = (value) => {
        if (value >= 1000000) {
            return (value / 1000000).toFixed(2) + 'M';
        } else if (value >= 1000) {
            return (value / 1000).toFixed(2) + 'K';
        }
        return value.toFixed(0);
    };
    
    const formatDate = (dateInt) => {
        if (!dateInt) return 'N/A';
        const str = dateInt.toString();
        const year = str.substring(0, 4);
        const month = str.substring(4, 6);
        return `${year}-${month}`;
    };
    
    let html = `
        <div class="stat-card">
            <div class="stat-label">Total Records</div>
            <div class="stat-value">${summary.total_records.toLocaleString()}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Total Value (FOB)</div>
            <div class="stat-value">${formatCurrency(summary.total_value)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Total Quantity</div>
            <div class="stat-value">${formatNumber(summary.total_quantity)} kg</div>
        </div>
    `;
    
    if (summary.date_range) {
        html += `
            <div class="stat-card">
                <div class="stat-label">Date Range</div>
                <div class="stat-value">${formatDate(summary.date_range.start)} - ${formatDate(summary.date_range.end)}</div>
            </div>
        `;
    }
    
    if (summary.countries && summary.countries.length > 0) {
        html += `
            <div class="stat-card">
                <div class="stat-label">Countries</div>
                <div class="stat-value">${summary.countries.length}</div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Setup chart resize observer
function setupExportChartResizeObserver() {
    const chartWrapper = document.querySelector('#exportChart')?.closest('.chart-wrapper');
    if (!chartWrapper) return;
    
    let lastWidth = 0;
    let lastHeight = 0;
    let resizeTimeout = null;
    
    const observer = new ResizeObserver(entries => {
        for (let entry of entries) {
            const canvas = entry.target.querySelector('canvas');
            if (!canvas || !exportChart) continue;
            
            const containerWidth = Math.floor(entry.contentRect.width);
            const containerHeight = Math.floor(entry.contentRect.height);
            
            if (Math.abs(containerWidth - lastWidth) < 2 && Math.abs(containerHeight - lastHeight) < 2) {
                continue;
            }
            
            lastWidth = containerWidth;
            lastHeight = containerHeight;
            
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            
            resizeTimeout = setTimeout(() => {
                canvas.style.width = containerWidth + 'px';
                canvas.style.height = containerHeight + 'px';
                if (exportChart) {
                    requestAnimationFrame(() => {
                        exportChart.resize();
                    });
                }
            }, 100);
        }
    });
    
    observer.observe(chartWrapper);
}

// Display chart
function displayChart(data, groupBy) {
    const ctx = document.getElementById('exportChart');
    if (!ctx) return;
    
    const chartTitle = document.getElementById('chartTitle');
    
    // Destroy existing chart
    if (exportChart) {
        exportChart.destroy();
    }
    
    if (!data || data.length === 0) {
        chartTitle.textContent = 'No data to display';
        return;
    }
    
    // Get selected categories and countries
    const selectedCategories = Array.from(document.querySelectorAll('#woolCategorySelector input[type="checkbox"]:checked'))
        .map(cb => cb.value);
    const countryFilter = document.getElementById('countryFilter');
    const selectedCountries = Array.from(countryFilter.selectedOptions)
        .map(opt => opt.value)
        .filter(v => v !== '');
    
    // Determine display mode
    const hasMultipleCountries = selectedCountries.length > 1;
    const hasMultipleCategories = selectedCategories.length > 1;
    const shouldCompareCategories = categoryMode === 'compare' && hasMultipleCategories;
    const shouldCompareCountries = hasMultipleCountries;
    const shouldShowCombinations = shouldCompareCountries && shouldCompareCategories;
    
    // Prepare chart data based on groupBy, category mode, and country selection
    let labels = [];
    let datasets = [];
    
    // Sort data appropriately
    const sortedData = [...data].sort((a, b) => {
        if (groupBy === 'month') {
            return a.month - b.month;
        } else if (groupBy === 'country') {
            return b.total_export_fob - a.total_export_fob; // Sort by value descending
        } else {
            return b.total_export_fob - a.total_export_fob;
        }
    });
    
    // Show all data (no limit)
    const displayData = sortedData;
    
    // More contrasting colors for series
    const contrastingColors = [
        'rgba(61, 127, 75, 0.8)',    // Green
        'rgba(200, 50, 50, 0.8)',    // Red
        'rgba(50, 100, 200, 0.8)',   // Blue
        'rgba(200, 150, 50, 0.8)',   // Orange
        'rgba(150, 50, 200, 0.8)',   // Purple
        'rgba(50, 200, 150, 0.8)',   // Teal
        'rgba(200, 200, 50, 0.8)',   // Yellow
        'rgba(200, 100, 150, 0.8)',  // Pink
        'rgba(100, 150, 200, 0.8)',  // Light Blue
        'rgba(150, 200, 100, 0.8)',  // Light Green
        'rgba(255, 100, 100, 0.8)',  // Light Red
        'rgba(100, 100, 255, 0.8)',  // Light Blue 2
        'rgba(255, 150, 100, 0.8)',  // Light Orange
        'rgba(150, 255, 150, 0.8)',  // Light Green 2
        'rgba(255, 200, 100, 0.8)',  // Light Yellow
        'rgba(200, 150, 255, 0.8)'   // Light Purple
    ];
    
    if (shouldShowCombinations) {
        // Show all combinations: each country × each category = separate series
        // e.g., 2 countries × 2 categories = 4 series
        const combinationData = {};
        
        displayData.forEach(item => {
            const country = item.country || 'Unknown';
            const category = item.wool_category || 'other';
            
            // Only process if both country and category are selected
            if (selectedCountries.length > 0 && !selectedCountries.includes(country)) {
                return;
            }
            if (!selectedCategories.includes(category)) {
                return;
            }
            
            let label = '';
            if (groupBy === 'month') {
                label = formatDateDisplay(item.month);
            } else if (groupBy === 'country') {
                // When grouping by country, use category as label
                label = WOOL_CATEGORIES[category] || category;
            } else if (groupBy === 'wool_category' || groupBy === 'processing_stage' || groupBy === 'micron_range') {
                // When grouping by category-related field, use country as label
                label = country;
            } else {
                label = item[groupBy] || 'Unknown';
            }
            
            const combinationKey = `${country}::${category}`;
            
            if (!combinationData[combinationKey]) {
                combinationData[combinationKey] = {};
            }
            
            if (!combinationData[combinationKey][label]) {
                combinationData[combinationKey][label] = {
                    value: 0,
                    quantity: 0
                };
            }
            
                    combinationData[combinationKey][label].value += item.total_export_fob || 0;
                    combinationData[combinationKey][label].quantity += item.total_export_qty || 0;
        });
        
        // Get all unique labels
        const allLabels = new Set();
        Object.values(combinationData).forEach(comboData => {
            Object.keys(comboData).forEach(label => allLabels.add(label));
        });
        
        labels = Array.from(allLabels).sort((a, b) => {
            if (groupBy === 'month') {
                const aMonth = displayData.find(d => {
                    const label = formatDateDisplay(d.month);
                    return label === a;
                })?.month;
                const bMonth = displayData.find(d => {
                    const label = formatDateDisplay(d.month);
                    return label === b;
                })?.month;
                if (aMonth && bMonth) {
                    return aMonth - bMonth;
                }
            }
            return 0;
        });
        
        // Create dataset for each combination
        let colorIndex = 0;
        selectedCountries.forEach(country => {
            selectedCategories.forEach(category => {
                const combinationKey = `${country}::${category}`;
                if (combinationData[combinationKey] && Object.keys(combinationData[combinationKey]).length > 0) {
                    const categoryLabel = WOOL_CATEGORIES[category] || category;
                    const seriesLabel = `${country} - ${categoryLabel}`;
                    
                    const data = labels.map(label => {
                        const comboData = combinationData[combinationKey][label];
                        if (chartDisplayMode === 'value') {
                            return comboData ? comboData.value : 0;
                        } else if (chartDisplayMode === 'volume' || chartDisplayMode === 'both') {
                            return comboData ? comboData.quantity : 0;
                        }
                        return 0;
                    });
                    
                    datasets.push({
                        label: seriesLabel,
                        data: data,
                        backgroundColor: contrastingColors[colorIndex % contrastingColors.length],
                        borderColor: contrastingColors[colorIndex % contrastingColors.length].replace('0.8', '1'),
                        borderWidth: 1,
                        yAxisID: 'y',
                        type: 'bar'
                    });
                    colorIndex++;
                }
            });
        });
        
        // If 'both' mode, add aggregated value as a line on secondary axis
        if (chartDisplayMode === 'both') {
            const aggregatedValueData = labels.map(label => {
                let totalValue = 0;
                selectedCountries.forEach(country => {
                    selectedCategories.forEach(category => {
                        const combinationKey = `${country}::${category}`;
                        if (combinationData[combinationKey] && combinationData[combinationKey][label]) {
                            totalValue += combinationData[combinationKey][label].value || 0;
                        }
                    });
                });
                return totalValue;
            });
            
            datasets.push({
                label: 'Total Export Value (FOB)',
                data: aggregatedValueData,
                type: 'line',
                borderColor: VALUE_COLOR,
                backgroundColor: VALUE_COLOR.replace('1)', '0.1)'),
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                pointRadius: 4,
                pointHoverRadius: 6,
                yAxisID: 'y1'
            });
        }
    } else if (shouldCompareCountries && !shouldCompareCategories) {
        // Compare countries only (no category comparison): separate series for each country
        const countryData = {};
        
        displayData.forEach(item => {
            const country = item.country || 'Unknown';
            
            // Only process if this country is selected
            if (selectedCountries.length > 0 && !selectedCountries.includes(country)) {
                return;
            }
            
            let label = '';
            if (groupBy === 'month') {
                label = formatDateDisplay(item.month);
            } else if (groupBy === 'country') {
                // When grouping by country, use category or processing stage as label
                label = item.processing_stage || item.micron_range || 'Unknown';
            } else {
                label = item[groupBy] || 'Unknown';
            }
            
            if (!countryData[country]) {
                countryData[country] = {};
            }
            
            if (!countryData[country][label]) {
                countryData[country][label] = {
                    value: 0,
                    quantity: 0
                };
            }
            
            countryData[country][label].value += item.total_export_fob || 0;
            countryData[country][label].quantity += item.total_export_qty || 0;
        });
        
        // Get all unique labels
        const allLabels = new Set();
        Object.values(countryData).forEach(ctyData => {
            Object.keys(ctyData).forEach(label => allLabels.add(label));
        });
        
        labels = Array.from(allLabels).sort((a, b) => {
            if (groupBy === 'month') {
                const aMonth = displayData.find(d => {
                    const label = formatDateDisplay(d.month);
                    return label === a;
                })?.month;
                const bMonth = displayData.find(d => {
                    const label = formatDateDisplay(d.month);
                    return label === b;
                })?.month;
                if (aMonth && bMonth) {
                    return aMonth - bMonth;
                }
            }
            return 0;
        });
        
        // Create dataset for each country
        let colorIndex = 0;
        selectedCountries.forEach(country => {
            if (countryData[country] && Object.keys(countryData[country]).length > 0) {
                const data = labels.map(label => {
                    const ctyData = countryData[country][label];
                    if (chartDisplayMode === 'value') {
                        return ctyData ? ctyData.value : 0;
                    } else if (chartDisplayMode === 'volume' || chartDisplayMode === 'both') {
                        return ctyData ? ctyData.quantity : 0;
                    }
                    return 0;
                });
                
                datasets.push({
                    label: country,
                    data: data,
                    backgroundColor: contrastingColors[colorIndex % contrastingColors.length],
                    borderColor: contrastingColors[colorIndex % contrastingColors.length].replace('0.8', '1'),
                    borderWidth: 1,
                    yAxisID: 'y',
                    type: 'bar'
                });
                colorIndex++;
            }
        });
        
        // If 'both' mode, add aggregated value as a line on secondary axis
        if (chartDisplayMode === 'both') {
            const aggregatedValueData = labels.map(label => {
                let totalValue = 0;
                selectedCountries.forEach(country => {
                    if (countryData[country] && countryData[country][label]) {
                        totalValue += countryData[country][label].value || 0;
                    }
                });
                return totalValue;
            });
            
            datasets.push({
                label: 'Total Export Value (FOB)',
                data: aggregatedValueData,
                type: 'line',
                borderColor: VALUE_COLOR,
                backgroundColor: VALUE_COLOR.replace('1)', '0.1)'),
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                pointRadius: 4,
                pointHoverRadius: 6,
                yAxisID: 'y1'
            });
        }
    } else if (shouldCompareCategories && !shouldCompareCountries) {
        // Compare mode: separate series for each category
        // Group data by category and the groupBy field
        const categoryData = {};
        
        displayData.forEach(item => {
            // In compare mode, we have raw data with wool_category field
            const category = item.wool_category || 'other';
            
            // Only process if this category is selected
            if (!selectedCategories.includes(category)) {
                return;
            }
            
            let label = '';
            if (groupBy === 'month') {
                label = formatDateDisplay(item.month);
            } else if (groupBy === 'country') {
                label = item.country || 'Unknown';
            } else if (groupBy === 'processing_stage') {
                label = item.processing_stage || 'Unknown';
            } else if (groupBy === 'micron_range') {
                label = item.micron_range || 'Unknown';
            } else {
                label = item[groupBy] || 'Unknown';
            }
            
            if (!categoryData[category]) {
                categoryData[category] = {};
            }
            
            if (!categoryData[category][label]) {
                categoryData[category][label] = {
                    value: 0,
                    quantity: 0
                };
            }
            
            categoryData[category][label].value += item.total_export_fob || 0;
            categoryData[category][label].quantity += item.total_export_qty || 0;
        });
        
        // Get all unique labels
        const allLabels = new Set();
        Object.values(categoryData).forEach(catData => {
            Object.keys(catData).forEach(label => allLabels.add(label));
        });
        
        if (allLabels.size === 0) {
            chartTitle.textContent = 'No data to display for selected categories';
            return;
        }
        
        labels = Array.from(allLabels).sort((a, b) => {
            if (groupBy === 'month') {
                // Find the month value for sorting
                const aMonth = displayData.find(d => {
                    const label = formatDateDisplay(d.month);
                    return label === a;
                })?.month;
                const bMonth = displayData.find(d => {
                    const label = formatDateDisplay(d.month);
                    return label === b;
                })?.month;
                if (aMonth && bMonth) {
                    return aMonth - bMonth;
                }
            }
            return 0;
        });
        
        // Create dataset for each selected category
        let colorIndex = 0;
        selectedCategories.forEach(category => {
            if (categoryData[category] && Object.keys(categoryData[category]).length > 0) {
                const categoryLabel = WOOL_CATEGORIES[category] || category;
                const data = labels.map(label => {
                    const catData = categoryData[category][label];
                    if (chartDisplayMode === 'value') {
                        return catData ? catData.value : 0;
                    } else if (chartDisplayMode === 'volume' || chartDisplayMode === 'both') {
                        return catData ? catData.quantity : 0;
                    }
                    return 0;
                });
                
                datasets.push({
                    label: categoryLabel,
                    data: data,
                    backgroundColor: contrastingColors[colorIndex % contrastingColors.length],
                    borderColor: contrastingColors[colorIndex % contrastingColors.length].replace('0.8', '1'),
                    borderWidth: 1,
                    yAxisID: 'y',
                    type: 'bar'
                });
                colorIndex++;
            }
        });
        
        // If 'both' mode, add aggregated value as a line on secondary axis
        if (chartDisplayMode === 'both') {
            const aggregatedValueData = labels.map(label => {
                let totalValue = 0;
                selectedCategories.forEach(category => {
                    if (categoryData[category] && categoryData[category][label]) {
                        totalValue += categoryData[category][label].value || 0;
                    }
                });
                return totalValue;
            });
            
            datasets.push({
                label: 'Total Export Value (FOB)',
                data: aggregatedValueData,
                type: 'line',
                borderColor: VALUE_COLOR,
                backgroundColor: VALUE_COLOR.replace('1)', '0.1)'),
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                pointRadius: 4,
                pointHoverRadius: 6,
                yAxisID: 'y1'
            });
        }
    } else {
        // Combine mode: aggregate all selected categories
        const aggregated = {};
        
        displayData.forEach(item => {
            let label = '';
            if (groupBy === 'month') {
                label = formatDateDisplay(item.month);
            } else {
                label = item[groupBy] || 'Unknown';
            }
            
            if (!aggregated[label]) {
                aggregated[label] = {
                    value: 0,
                    quantity: 0
                };
            }
            
            aggregated[label].value += item.total_export_fob || 0;
            aggregated[label].quantity += item.total_export_qty || 0;
        });
        
        labels = Object.keys(aggregated).sort((a, b) => {
            if (groupBy === 'month') {
                // Sort by date
                const aDate = displayData.find(d => {
                    const label = formatDateDisplay(d.month);
                    return label === a;
                })?.month || 0;
                const bDate = displayData.find(d => {
                    const label = formatDateDisplay(d.month);
                    return label === b;
                })?.month || 0;
                return aDate - bDate;
            }
            return aggregated[b].value - aggregated[a].value;
        });
        
        const valueData = labels.map(label => aggregated[label].value);
        const quantityData = labels.map(label => aggregated[label].quantity);
        
        // Prepare datasets based on display mode
        if (chartDisplayMode === 'value') {
            datasets.push({
                label: 'Export Value (FOB)',
                data: valueData,
                backgroundColor: VALUE_COLOR.replace('1)', '0.7)'),
                borderColor: VALUE_COLOR,
                borderWidth: 1,
                yAxisID: 'y'
            });
        } else if (chartDisplayMode === 'volume') {
            datasets.push({
                label: 'Export Quantity (kg)',
                data: quantityData,
                backgroundColor: VOLUME_COLOR.replace('1)', '0.7)'),
                borderColor: VOLUME_COLOR,
                borderWidth: 1,
                yAxisID: 'y'
            });
        } else if (chartDisplayMode === 'both') {
            // Volume as bars on primary axis (left)
            datasets.push({
                label: 'Export Quantity (kg)',
                data: quantityData,
                type: 'bar',
                backgroundColor: VOLUME_COLOR.replace('1)', '0.7)'),
                borderColor: VOLUME_COLOR,
                borderWidth: 1,
                yAxisID: 'y'
            });
            // Value as line on secondary axis (right)
            datasets.push({
                label: 'Export Value (FOB)',
                data: valueData,
                type: 'line',
                borderColor: VALUE_COLOR,
                backgroundColor: VALUE_COLOR.replace('1)', '0.1)'),
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                pointRadius: 4,
                pointHoverRadius: 6,
                yAxisID: 'y1'
            });
        }
    }
    
    if (datasets.length === 0) {
        chartTitle.textContent = 'No data to display for selected categories';
        return;
    }
    
    // Update chart title
    const groupByLabels = {
        'month': 'Export Trends Over Time',
        'country': 'Exports by Country',
        'processing_stage': 'Exports by Processing Stage',
        'micron_range': 'Exports by Micron Range',
        'wool_category': 'Exports by Wool Category'
    };
    chartTitle.textContent = groupByLabels[groupBy] || 'Export Data Analysis';
    
    // Create chart (default type is 'bar', individual datasets can override with 'type' property)
    exportChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: undefined,
            plugins: {
                legend: {
                    display: shouldCompareCategories || shouldCompareCountries || shouldShowCombinations || chartDisplayMode === 'both',
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.dataset.label && context.dataset.label.includes('Value')) {
                                label += '$' + context.parsed.y.toLocaleString();
                            } else {
                                label += context.parsed.y.toLocaleString() + ' kg';
                            }
                            return label;
                        }
                    }
                }
            },
            layout: {
                padding: {
                    bottom: 20,
                    left: 10,
                    right: 10,
                    top: 10
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: chartDisplayMode === 'value' ? 'Export Value (FOB) - NZD' : (chartDisplayMode === 'both' ? 'Export Quantity (kg)' : 'Export Quantity (kg)'),
                        color: chartDisplayMode === 'value' ? VALUE_COLOR : (chartDisplayMode === 'both' ? VOLUME_COLOR : VOLUME_COLOR),
                        font: { weight: 'bold', size: 12 }
                    },
                    ticks: {
                        color: chartDisplayMode === 'value' ? VALUE_COLOR : (chartDisplayMode === 'both' ? VOLUME_COLOR : VOLUME_COLOR),
                        callback: function(value) {
                            if (chartDisplayMode === 'value') {
                                if (value >= 1000000) {
                                    return '$' + (value / 1000000).toFixed(1) + 'M';
                                } else if (value >= 1000) {
                                    return '$' + (value / 1000).toFixed(1) + 'K';
                                }
                                return '$' + value;
                            } else {
                                if (value >= 1000000) {
                                    return (value / 1000000).toFixed(1) + 'M';
                                } else if (value >= 1000) {
                                    return (value / 1000).toFixed(1) + 'K';
                                }
                                return value;
                            }
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: chartDisplayMode === 'both',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Export Value (FOB) - NZD',
                        color: VALUE_COLOR,
                        font: { weight: 'bold', size: 12 }
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: VALUE_COLOR,
                        callback: function(value) {
                            if (value >= 1000000) {
                                return '$' + (value / 1000000).toFixed(1) + 'M';
                            } else if (value >= 1000) {
                                return '$' + (value / 1000).toFixed(1) + 'K';
                            }
                            return '$' + value;
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: {
                            size: 10
                        }
                    },
                    title: {
                        display: true,
                        text: groupBy === 'month' ? 'Month' : (groupBy === 'country' ? 'Country' : groupBy.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()))
                    }
                }
            }
        }
    });
    
    // Set canvas dimensions explicitly
    const chartWrapper = ctx.closest('.chart-wrapper');
    if (chartWrapper) {
        const wrapperWidth = chartWrapper.offsetWidth;
        const wrapperHeight = chartWrapper.offsetHeight;
        ctx.style.width = wrapperWidth + 'px';
        ctx.style.height = wrapperHeight + 'px';
    }
    
    // Setup resize observer
    setupExportChartResizeObserver();
}

// Error handling
function showError(message) {
    const errorMsg = document.getElementById('errorMsg');
    if (errorMsg) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
        errorMsg.style.color = '#d32f2f';
        errorMsg.style.padding = '12px';
        errorMsg.style.backgroundColor = '#ffebee';
        errorMsg.style.borderRadius = '4px';
        errorMsg.style.marginBottom = '20px';
    }
}

function hideError() {
    const errorMsg = document.getElementById('errorMsg');
    if (errorMsg) {
        errorMsg.style.display = 'none';
    }
}

// Export current data to CSV
async function exportToCSV() {
    if (!currentData || currentData.length === 0) {
        showError('No data to export. Please load data first.');
        return;
    }
    
    try {
        // Get current filters to reload the same data
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const countryFilter = document.getElementById('countryFilter');
        const selectedCountries = Array.from(countryFilter.selectedOptions)
            .map(opt => opt.value)
            .filter(v => v !== '');
        const selectedCategories = Array.from(document.querySelectorAll('#woolCategorySelector input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        
        // Get files needed for this date range
        const selectedFiles = getFilesForDateRange(startDate, endDate);
        
        if (selectedFiles.length === 0) {
            showError('No data files available for the selected date range');
            return;
        }
        
        const dateRangeArray = [parseInt(startDate), parseInt(endDate)];
        
        // Load full raw data for export
        const response = await fetch('/api/export-data/load', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filenames: selectedFiles,
                wool_only: true,
                date_range: dateRangeArray,
                countries: selectedCountries.length > 0 ? selectedCountries : null,
                wool_categories: selectedCategories
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        if (!data.data || data.data.length === 0) {
            showError('No data to export');
            return;
        }
        
        // Convert to CSV
        const csvData = convertToCSV(data.data);
        
        // Create download link
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        // Generate filename with date range
        const filename = `export_data_${startDate}_${endDate}_${new Date().getTime()}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (error) {
        console.error('Error exporting to CSV:', error);
        showError('Failed to export data: ' + error.message);
    }
}

// Convert data array to CSV string
function convertToCSV(data) {
    if (!data || data.length === 0) {
        return '';
    }
    
    // Get all unique keys from all objects
    const allKeys = new Set();
    data.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
    });
    
    // Order columns logically
    const columnOrder = [
        'month', 'hs', 'hs_desc', 'uom', 'country', 
        'export_fob', 'export_qty', 're_export_fob', 're_export_qty',
        'total_export_fob', 'total_export_qty', 'status',
        'wool_category', 'processing_stage', 'micron_range'
    ];
    
    const orderedKeys = [];
    columnOrder.forEach(key => {
        if (allKeys.has(key)) {
            orderedKeys.push(key);
            allKeys.delete(key);
        }
    });
    
    // Add any remaining keys
    Array.from(allKeys).sort().forEach(key => orderedKeys.push(key));
    
    // Create CSV header
    const header = orderedKeys.map(key => escapeCSV(key)).join(',');
    
    // Create CSV rows
    const rows = data.map(item => {
        return orderedKeys.map(key => {
            const value = item[key];
            if (value === null || value === undefined) {
                return '';
            }
            return escapeCSV(value.toString());
        }).join(',');
    });
    
    return [header, ...rows].join('\n');
}

// Escape CSV values (handle commas, quotes, newlines)
function escapeCSV(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    const stringValue = value.toString();
    
    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return '"' + stringValue.replace(/"/g, '""') + '"';
    }
    
    return stringValue;
}

