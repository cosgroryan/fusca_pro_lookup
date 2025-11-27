// Common JavaScript utilities shared across all pages

const columns = [
    { name: 'price', label: 'Price', type: 'number' },
    { name: 'bales', label: 'Bales', type: 'number' },
    { name: 'kg', label: 'KG', type: 'number' },
    { name: 'colour', label: 'Colour', type: 'number' },
    { name: 'micron', label: 'Micron', type: 'number' },
    { name: 'yield', label: 'Yield %', type: 'number' },
    { name: 'vegetable_matter', label: 'Vegetable Matter %', type: 'number' },
    { name: 'sale_date', label: 'Sale Date', type: 'date' },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'seller_name', label: 'Seller', type: 'text' },
    { name: 'farm_brand_name', label: 'Farm Brand', type: 'text' }
];

const operators = {
    number: [
        { value: 'eq', label: 'Equals' },
        { value: 'ne', label: 'Not Equals' },
        { value: 'gt', label: 'Greater Than' },
        { value: 'lt', label: 'Less Than' },
        { value: 'gte', label: 'Greater Than or Equal' },
        { value: 'lte', label: 'Less Than or Equal' },
        { value: 'between', label: 'Between' }
    ],
    text: [
        { value: 'contains', label: 'Contains' },
        { value: 'not_contains', label: 'Does Not Contain' },
        { value: 'eq', label: 'Equals' },
        { value: 'ne', label: 'Not Equals' }
    ],
    date: [
        { value: 'eq', label: 'Equals' },
        { value: 'gt', label: 'After' },
        { value: 'lt', label: 'Before' },
        { value: 'between', label: 'Between' }
    ]
};

// CSV export functionality
function downloadCSV(results, filename = null) {
    if (!results || results.length === 0) {
        alert('No results to download');
        return;
    }
    
    const headers = [
        'Sale Date', 'Lot Number', 'Wool Type ID', 'Type Combined', 
        'Price ($)', 'Bales', 'KG', 'Colour', 'Micron', 'Yield %', 
        'VM %', 'Location', 'Seller', 'Farm Brand', 'Sold'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    results.forEach(row => {
        const priceInDollars = (row.price / 100).toFixed(2);
        
        const rowData = [
            row.sale_date || '',
            (row.lot_number || '').trim(),
            row.wool_type_id || '',
            escapeCSV(row.type_combined || ''),
            priceInDollars,
            row.bales || '',
            row.kg || '',
            row.colour ? row.colour.toFixed(1) : '',
            row.micron ? row.micron.toFixed(1) : '',
            row.yield ? row.yield.toFixed(1) : '',
            row.vegetable_matter ? row.vegetable_matter.toFixed(1) : '',
            escapeCSV(row.location || ''),
            escapeCSV(row.seller_name || ''),
            escapeCSV(row.farm_brand_name || ''),
            row.is_sold ? 'Yes' : 'No'
        ];
        
        csvContent += rowData.join(',') + '\n';
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    if (!filename) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        filename = `auction_data_${timestamp}.csv`;
    }
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log(`Downloaded ${results.length} results to ${filename}`);
}

function escapeCSV(str) {
    if (str == null) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// Excel export functionality
async function downloadExcel(results) {
    if (!results || results.length === 0) {
        alert('No results to export');
        return;
    }
    
    try {
        const response = await fetch('/api/export/excel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ results: results })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Export failed');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        link.download = `auction_data_${timestamp}.xlsx`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        console.log(`Exported ${results.length} results to Excel`);
    } catch (error) {
        console.error('Excel export error:', error);
        alert('Error exporting to Excel: ' + error.message);
    }
}

// Chart PNG export functionality
function downloadChartPNG(chartId, filename = null) {
    const canvas = document.getElementById(chartId);
    if (!canvas) {
        alert('Chart not found');
        return;
    }
    
    if (!filename) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        filename = `chart_${chartId}_${timestamp}.png`;
    }
    
    // Convert canvas to blob and download
    canvas.toBlob(function(blob) {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    });
}

// Regression PDF export functionality
async function downloadRegressionPDF(regressionData) {
    if (!regressionData) {
        alert('No regression data to export');
        return;
    }
    
    try {
        const response = await fetch('/api/export/regression-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ regression_data: regressionData })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'PDF export failed');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        link.download = `regression_analysis_${timestamp}.pdf`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        console.log('Regression analysis exported to PDF');
    } catch (error) {
        console.error('PDF export error:', error);
        alert('Error exporting to PDF: ' + error.message);
    }
}

// Date range helper functions
function getDateRangeFilter(range) {
    const today = new Date();
    // Add 2 days to account for server time vs dataset time differences
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 2);
    
    let fromDate;
    
    if (range === '6m') {
        fromDate = new Date(today);
        fromDate.setMonth(fromDate.getMonth() - 6);
    } else if (range === '1y') {
        fromDate = new Date(today);
        fromDate.setFullYear(fromDate.getFullYear() - 1);
    } else if (range === '3y') {
        fromDate = new Date(today);
        fromDate.setFullYear(fromDate.getFullYear() - 3);
    } else {
        return null;
    }
    
    return {
        column: 'sale_date',
        operator: 'between',
        value: fromDate.toISOString().split('T')[0],
        value2: endDate.toISOString().split('T')[0]
    };
}

// Module toggle function
function toggleModule(moduleId) {
    const content = document.getElementById(moduleId + 'Content');
    const button = event.target.closest('.hide-btn') || event.target;
    
    if (content.classList.contains('collapsed')) {
        // Content is hidden, show it (use eye-off icon because user can hide it)
        content.classList.remove('collapsed');
        button.classList.add('content-visible');
        const img = button.querySelector('img');
        if (img) {
            img.src = '/static/images/eye-off-svgrepo-com.svg';
            img.alt = 'Hide';
        }
        button.setAttribute('aria-label', 'Hide');
    } else {
        // Content is visible, hide it (use eye icon because user can show it)
        content.classList.add('collapsed');
        button.classList.remove('content-visible');
        const img = button.querySelector('img');
        if (img) {
            img.src = '/static/images/eye-svgrepo-com.svg';
            img.alt = 'Show';
        }
        button.setAttribute('aria-label', 'Show');
    }
}

// Linear interpolation for chart data
function interpolateDataset(dataArray) {
    const interpolated = [...dataArray];
    
    for (let i = 0; i < interpolated.length; i++) {
        if (interpolated[i] === null || interpolated[i] === undefined) {
            let prevIdx = i - 1;
            while (prevIdx >= 0 && (interpolated[prevIdx] === null || interpolated[prevIdx] === undefined)) {
                prevIdx--;
            }
            
            let nextIdx = i + 1;
            while (nextIdx < interpolated.length && (interpolated[nextIdx] === null || interpolated[nextIdx] === undefined)) {
                nextIdx++;
            }
            
            if (prevIdx >= 0 && nextIdx < interpolated.length) {
                const prevValue = interpolated[prevIdx];
                const nextValue = interpolated[nextIdx];
                const distance = nextIdx - prevIdx;
                const position = i - prevIdx;
                interpolated[i] = prevValue + (nextValue - prevValue) * (position / distance);
            } else if (prevIdx >= 0) {
                interpolated[i] = interpolated[prevIdx];
            } else if (nextIdx < interpolated.length) {
                interpolated[i] = interpolated[nextIdx];
            }
        }
    }
    
    return interpolated;
}

// Calculate Simple Moving Average
function calculateMovingAverage(data, period) {
    const ma = [];
    
    for (let i = 0; i < data.length; i++) {
        if (data[i] === null || data[i] === undefined) {
            ma.push(null);
            continue;
        }
        
        // Collect valid values in the window
        const windowStart = Math.max(0, i - period + 1);
        const windowValues = [];
        
        for (let j = windowStart; j <= i; j++) {
            if (data[j] !== null && data[j] !== undefined) {
                windowValues.push(data[j]);
            }
        }
        
        // Calculate average if we have enough data points
        if (windowValues.length > 0) {
            const sum = windowValues.reduce((a, b) => a + b, 0);
            ma.push(sum / windowValues.length);
        } else {
            ma.push(null);
        }
    }
    
    return ma;
}

// Format statistics for display
function formatStats(stats) {
    if (!stats) return '';
    
    return `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 12px; padding: 12px; background: white; border-radius: 4px; border: 1px solid #e0e0e0;">
            <div style="text-align: center;">
                <div style="font-size: 10px; color: #666; margin-bottom: 4px;">MIN</div>
                <div style="font-size: 14px; font-weight: 600; color: #D32F2F;">$${stats.min.toFixed(2)}/kg</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 10px; color: #666; margin-bottom: 4px;">MAX</div>
                <div style="font-size: 14px; font-weight: 600; color: #28a745;">$${stats.max.toFixed(2)}/kg</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 10px; color: #666; margin-bottom: 4px;">MEDIAN</div>
                <div style="font-size: 14px; font-weight: 600; color: #3D7F4B;">$${stats.median.toFixed(2)}/kg</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 10px; color: #666; margin-bottom: 4px;">AVG (VWAP)</div>
                <div style="font-size: 14px; font-weight: 600; color: #1976D2;">$${stats.mean.toFixed(2)}/kg</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 10px; color: #666; margin-bottom: 4px;">STD DEV</div>
                <div style="font-size: 14px; font-weight: 600; color: #666;">$${stats.std_dev.toFixed(2)}/kg</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 10px; color: #666; margin-bottom: 4px;">RECORDS</div>
                <div style="font-size: 14px; font-weight: 600; color: #666;">${stats.count.toLocaleString()}</div>
            </div>
        </div>
    `;
}

