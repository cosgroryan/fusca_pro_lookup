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

// Date range helper functions
function getDateRangeFilter(range) {
    const today = new Date();
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
        value2: today.toISOString().split('T')[0]
    };
}

// Module toggle function
function toggleModule(moduleId) {
    const content = document.getElementById(moduleId + 'Content');
    const button = event.target;
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        button.textContent = 'Hide';
    } else {
        content.classList.add('collapsed');
        button.textContent = 'Show';
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

