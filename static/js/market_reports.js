// Market Reports JavaScript

let savedSearches = [];
let sections = [];
let indicators = [];
let selectedSearches = new Set();
let reportConfig = {
    logo: null,
    heroImage: null,
    title: 'Strong wool report',
    year: new Date().getFullYear().toString(),
    saleDate: '',
    nextAuction: '',
    offering: '',
    passings: '',
    nzdUsd: '',
    commentary: '',
    primaryColor: '#1A4C41', // Default dark green
    secondaryColor: '#3D7F4B' // Default medium green
};
let indicatorChart = null;

// Generate color palette from primary and secondary colors
function generateColorPalette(primaryColor, secondaryColor) {
    // Helper function to lighten a color
    const lighten = (color, percent) => {
        const num = parseInt(color.replace("#", ""), 16);
        const r = Math.min(255, (num >> 16) + Math.round((255 - (num >> 16)) * percent));
        const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round((255 - ((num >> 8) & 0x00FF)) * percent));
        const b = Math.min(255, (num & 0x0000FF) + Math.round((255 - (num & 0x0000FF)) * percent));
        return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    };
    
    // Helper function to darken a color
    const darken = (color, percent) => {
        const num = parseInt(color.replace("#", ""), 16);
        const r = Math.max(0, Math.round((num >> 16) * (1 - percent)));
        const g = Math.max(0, Math.round(((num >> 8) & 0x00FF) * (1 - percent)));
        const b = Math.max(0, Math.round((num & 0x0000FF) * (1 - percent)));
        return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    };
    
    return {
        primary: primaryColor || '#1A4C41',
        primaryLight: lighten(primaryColor || '#1A4C41', 0.3),
        primaryDark: darken(primaryColor || '#1A4C41', 0.2),
        secondary: secondaryColor || '#3D7F4B',
        secondaryLight: lighten(secondaryColor || '#3D7F4B', 0.3),
        secondaryDark: darken(secondaryColor || '#3D7F4B', 0.2),
        // For text on colored backgrounds
        textOnPrimary: '#ffffff',
        textOnSecondary: '#ffffff'
    };
}

// Load saved searches on page load
function loadSavedSearches() {
    const allSaved = JSON.parse(localStorage.getItem('fusca_saved_searches') || '[]');
    savedSearches = allSaved.filter(s => s.page === 'simple' || s.page === 'blends' || s.page === 'compare');
    renderSavedSearches();
}

function renderSavedSearches() {
    const container = document.getElementById('savedSearchesList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (savedSearches.length === 0) {
        container.innerHTML = '<p style="color: #666; font-size: 11px;">No saved searches found. Save searches in Simple Search or Blends first.</p>';
        return;
    }
    
    savedSearches.forEach(search => {
        const item = document.createElement('div');
        item.className = 'saved-search-item-selectable';
        item.innerHTML = `
            <input type="checkbox" id="search_${search.id}" onchange="toggleSearchSelection(${search.id})">
            <label for="search_${search.id}" style="cursor: pointer; flex: 1; margin: 0;">
                ${search.type === 'blend' || search.page === 'blends' ? '✨ ' : ''}${search.name}
            </label>
        `;
        container.appendChild(item);
    });
}

function toggleSearchSelection(searchId) {
    const checkbox = document.getElementById(`search_${searchId}`);
    if (checkbox.checked) {
        selectedSearches.add(searchId);
        // Add to all sections' allowed searches if they don't already have it
        sections.forEach(section => {
            if (!section.allowedSearchIds) {
                section.allowedSearchIds = [];
            }
            if (!section.allowedSearchIds.includes(searchId)) {
                section.allowedSearchIds.push(searchId);
            }
        });
        renderSections(); // Re-render to show new option in dropdowns
    } else {
        selectedSearches.delete(searchId);
        // Remove from sections
        sections.forEach(section => {
            section.searchIds = section.searchIds.filter(id => id !== searchId);
        });
        renderSections();
    }
    
    const item = checkbox.closest('.saved-search-item-selectable');
    if (checkbox.checked) {
        item.classList.add('selected');
    } else {
        item.classList.remove('selected');
    }
}

let sectionCount = 0;

function addSection() {
    // Capture currently selected searches when section is created
    const currentlySelected = Array.from(selectedSearches);
    const sectionId = `section_${sectionCount++}`;
    sections.push({
        id: sectionId,
        title: 'New Section',
        searchIds: [],
        allowedSearchIds: [...currentlySelected] // Only allow searches selected when section was created
    });
    renderSections();
}

function removeSection(sectionId) {
    sections = sections.filter(s => s.id !== sectionId);
    renderSections();
}

function renderSections() {
    const container = document.getElementById('sectionsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    sections.forEach(section => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'section-item';
        sectionDiv.innerHTML = `
            <div class="section-header">
                <input type="text" class="section-title-input" value="${section.title}" 
                       onchange="updateSectionTitle('${section.id}', this.value)" 
                       placeholder="Section title">
                <span class="drag-handle">☰</span>
            </div>
            <div style="margin-top: 8px;">
                <select id="section_${section.id}_select" style="width: 100%; padding: 4px; font-size: 12px;" 
                        onchange="addSearchToSection('${section.id}', this.value); this.value='';">
                    <option value="">Add saved search to section...</option>
                    ${(section.allowedSearchIds || []).map(id => {
                        const search = savedSearches.find(s => s.id === id);
                        if (!search) return '';
                        const isInSection = section.searchIds.includes(id);
                        if (isInSection) return '';
                        return `<option value="${id}">${search.name}</option>`;
                    }).join('')}
                </select>
                <div id="section_${section.id}_items" style="margin-top: 8px;">
                    ${section.searchIds.map(id => {
                        const search = savedSearches.find(s => s.id === id);
                        if (!search) return '';
                        return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: white; border-radius: 4px; margin-bottom: 4px;">
                            <span style="font-size: 11px;">${search.name}</span>
                            <button onclick="removeSearchFromSection('${section.id}', ${id})" style="background: #dc3545; color: white; border: none; border-radius: 3px; padding: 2px 6px; font-size: 10px; cursor: pointer;">✕</button>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            <button onclick="removeSection('${section.id}')" style="margin-top: 8px; background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; width: 100%;">Remove Section</button>
        `;
        container.appendChild(sectionDiv);
    });
}

function updateSectionTitle(sectionId, title) {
    const section = sections.find(s => s.id === sectionId);
    if (section) {
        section.title = title;
    }
}

function addSearchToSection(sectionId, searchId) {
    const searchIdNum = parseInt(searchId);
    if (!searchIdNum) return;
    
    const section = sections.find(s => s.id === sectionId);
    if (section) {
        // Check if search is allowed in this section
        if (!section.allowedSearchIds || !section.allowedSearchIds.includes(searchIdNum)) {
            alert('This search was not selected when the section was created. Please uncheck and re-check it, then add the section again.');
            return;
        }
        if (!section.searchIds.includes(searchIdNum)) {
            section.searchIds.push(searchIdNum);
            renderSections();
        }
    }
}

function removeSearchFromSection(sectionId, searchId) {
    const section = sections.find(s => s.id === sectionId);
    if (section) {
        section.searchIds = section.searchIds.filter(id => id !== searchId);
        renderSections();
    }
}

// Indicator builder - uses saved blend searches
function showIndicatorBuilder() {
    const modal = document.getElementById('indicatorBuilderModal');
    if (!modal) return;
    
    modal.style.display = 'block';
    
    // Get all saved blend searches
    const blendSearches = savedSearches.filter(s => s.page === 'blends' || s.type === 'blend');
    
    const content = document.getElementById('indicatorBuilderContent');
    if (blendSearches.length === 0) {
        content.innerHTML = `
            <div style="margin-bottom: 16px;">
                <p style="color: #666;">No saved blend searches found. Please create and save a blend in the Advanced Blends tool first.</p>
                <button onclick="closeIndicatorBuilder()" class="btn btn-secondary" style="margin-top: 12px;">Close</button>
            </div>
        `;
        return;
    }
    
    content.innerHTML = `
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Select a saved blend to use as indicator:</label>
            <select id="indicatorBlendSelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                <option value="">Choose a blend...</option>
                ${blendSearches.map(blend => `<option value="${blend.id}">${blend.name}</option>`).join('')}
            </select>
        </div>
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Indicator Display Name (optional):</label>
            <input type="text" id="indicatorDisplayName" placeholder="Leave empty to use blend name" 
                   style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div style="display: flex; gap: 8px;">
            <button onclick="addIndicator()" class="btn">Add Indicator</button>
            <button onclick="closeIndicatorBuilder()" class="btn btn-secondary">Cancel</button>
        </div>
    `;
}

function addIndicator() {
    const blendSelect = document.getElementById('indicatorBlendSelect');
    const displayNameInput = document.getElementById('indicatorDisplayName');
    
    if (!blendSelect || !blendSelect.value) {
        alert('Please select a blend');
        return;
    }
    
    const blendId = parseInt(blendSelect.value);
    const blend = savedSearches.find(s => s.id === blendId);
    if (!blend) {
        alert('Blend not found');
        return;
    }
    
    const displayName = displayNameInput ? displayNameInput.value.trim() : '';
    const indicatorName = displayName || blend.name;
    
    // Check if already added
    if (indicators.find(i => i.blendId === blendId)) {
        alert('This indicator has already been added');
        return;
    }
    
    indicators.push({
        id: `indicator_${indicators.length}`,
        blendId: blendId,
        name: indicatorName,
        blendData: blend
    });
    
    renderIndicators();
    closeIndicatorBuilder();
}

function renderIndicators() {
    const container = document.getElementById('indicatorsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (indicators.length === 0) {
        container.innerHTML = '<p style="color: #666; font-size: 11px;">No indicators added yet.</p>';
        return;
    }
    
    indicators.forEach(indicator => {
        const item = document.createElement('div');
        item.className = 'section-item';
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; font-weight: 600;">${indicator.name}</span>
                <button onclick="removeIndicator('${indicator.id}')" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">Remove</button>
            </div>
        `;
        container.appendChild(item);
    });
}

function removeIndicator(indicatorId) {
    indicators = indicators.filter(i => i.id !== indicatorId);
    renderIndicators();
}

function closeIndicatorBuilder() {
    const modal = document.getElementById('indicatorBuilderModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Generate report preview
async function generateReport() {
    if (isPostOperationInProgress()) {
        console.log('Report generation already in progress');
        return;
    }
    
    if (sections.length === 0) {
        alert('Please add at least one section to your report');
        return;
    }
    
    disablePostButtons();
    
    const preview = document.getElementById('reportPreview');
    preview.innerHTML = '<div style="text-align: center; padding: 20px;">Generating report...</div>';
    
    try {
        // Fetch data for all selected searches
        const reportData = await fetchReportData();
        
        // Render the report
        await renderReport(reportData);
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Error generating report: ' + error.message);
        const preview = document.getElementById('reportPreview');
        if (preview) {
            preview.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">Error generating report. Please check the console for details.</div>';
        }
    } finally {
        enablePostButtons();
    }
}

async function fetchReportData() {
    const data = {};
    let mostRecentDate = null;
    
    // Fetch current/previous prices for each selected search
    for (const searchId of selectedSearches) {
        const search = savedSearches.find(s => s.id === searchId);
        if (!search) continue;
        
        try {
            const response = await fetch('/api/market_report/search_prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ savedSearch: search })
            });
            
            if (response.ok) {
                const priceData = await response.json();
                data[searchId] = priceData;
                
                // Track most recent date across all searches
                if (priceData.current_date) {
                    if (!mostRecentDate || priceData.current_date > mostRecentDate) {
                        mostRecentDate = priceData.current_date;
                    }
                }
            }
        } catch (error) {
            console.error(`Error fetching price data for search ${searchId}:`, error);
        }
    }
    
    // Fetch NZD/USD rate
    try {
        const rateResponse = await fetch('/api/market_report/exchange_rate');
        if (rateResponse.ok) {
            const rateData = await rateResponse.json();
            reportConfig.nzdUsd = rateData.rate || '';
        }
    } catch (error) {
        console.error('Error fetching exchange rate:', error);
    }
    
    // Auto-fill sale date with most recent date
    if (mostRecentDate) {
        reportConfig.saleDate = mostRecentDate;
        
        // Auto-fill offering and passings for this date
        try {
            const saleDataResponse = await fetch('/api/market_report/sale_stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ saleDate: mostRecentDate })
            });
            
            if (saleDataResponse.ok) {
                const saleData = await saleDataResponse.json();
                reportConfig.offering = saleData.totalBales || '';
                reportConfig.passings = saleData.passings || '';
            }
        } catch (error) {
            console.error('Error fetching sale stats:', error);
        }
    }
    
    return data;
}

async function renderReport(reportData) {
    const preview = document.getElementById('reportPreview');
    
    // Generate color palette from user's brand colors
    const colors = generateColorPalette(reportConfig.primaryColor, reportConfig.secondaryColor);
    
    let html = `
        <div style="max-width: 800px; margin: 0 auto; font-family: 'Nunito Sans', sans-serif; font-size: 10px;">
            <!-- Report Header -->
            <div class="report-header" style="background: ${colors.primary}; color: ${colors.textOnPrimary}; padding: 12px; border-radius: 4px; margin-bottom: 12px;">
                <div class="report-header-top" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div>
                        <div class="report-title" style="font-size: 18px; font-weight: 700; margin-bottom: 2px;">
                            <input type="text" id="reportTitle" value="${reportConfig.title}" 
                                   onchange="reportConfig.title = this.value" 
                                   style="background: transparent; border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 4px; border-radius: 4px; font-size: 18px; font-weight: 700; width: 250px;">
                        </div>
                        <div class="report-year" style="font-size: 14px; opacity: 0.9;">
                            <input type="text" id="reportYear" value="${reportConfig.year}" 
                                   onchange="reportConfig.year = this.value" 
                                   style="background: transparent; border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 4px; border-radius: 4px; font-size: 14px; width: 80px;">
                        </div>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-size: 11px; opacity: 0.8;">Logo:</label>
                        <input type="file" id="logoUpload" accept="image/*" onchange="handleLogoUpload(event)" style="display: none;">
                        <button onclick="document.getElementById('logoUpload').click()" class="btn" style="font-size: 11px; padding: 4px 8px;">Upload Logo</button>
                        <div id="logoPreview" style="margin-top: 8px;">
                            ${reportConfig.logo ? `<img src="${reportConfig.logo}" style="max-height: 60px; max-width: 200px;">` : ''}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Hero Image and Market Info -->
            <div class="hero-section" style="display: grid; grid-template-columns: 1fr 280px; gap: 12px; margin-bottom: 12px;">
                <div class="hero-image-container" style="position: relative; border-radius: 4px; overflow: hidden; height: 150px; width: 100%; background: #f0f0f0;">
                    <input type="file" id="heroUpload" accept="image/*" onchange="handleHeroUpload(event)" style="display: none;">
                    ${reportConfig.heroImage ? 
                        `<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden;">
                            <img src="${reportConfig.heroImage}" class="hero-image-preview" style="width: 100%; height: 100%; object-fit: cover; object-position: center; display: block;">
                            <button onclick="document.getElementById('heroUpload').click()" class="btn" style="position: absolute; bottom: 8px; right: 8px; font-size: 10px; padding: 4px 8px; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">Change Image</button>
                        </div>` :
                        `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
                            <button onclick="document.getElementById('heroUpload').click()" class="btn" style="font-size: 10px; padding: 4px 8px;">Upload Hero Image</button>
                        </div>`
                    }
                </div>
                <div class="market-info-box" style="background: ${colors.primary}; color: ${colors.textOnPrimary}; padding: 10px; border-radius: 4px;">
                    <div class="market-info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 10px;">
                        <span style="font-weight: bold;">Sale Date:</span>
                        <input type="date" id="saleDateInput" value="${reportConfig.saleDate}" 
                               onchange="reportConfig.saleDate = this.value" 
                               style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 4px; border-radius: 3px; font-size: 10px; font-weight: normal;">
                    </div>
                    <div class="market-info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 10px;">
                        <span style="font-weight: bold;">Next Auction:</span>
                        <input type="date" id="nextAuctionInput" value="${reportConfig.nextAuction}" 
                               onchange="reportConfig.nextAuction = this.value" 
                               style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 4px; border-radius: 3px; font-size: 10px; font-weight: normal;">
                    </div>
                    <div class="market-info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 10px;">
                        <span style="font-weight: bold;">Offering (Bales):</span>
                        <input type="text" id="offeringInput" value="${reportConfig.offering}" 
                               onchange="reportConfig.offering = this.value" 
                               style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 4px; border-radius: 3px; font-size: 10px; width: 70px; font-weight: normal;">
                    </div>
                    <div class="market-info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 10px;">
                        <span style="font-weight: bold;">PASSINGS:</span>
                        <input type="text" id="passingsInput" value="${reportConfig.passings}" 
                               onchange="reportConfig.passings = this.value" 
                               style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 4px; border-radius: 3px; font-size: 10px; width: 50px; font-weight: normal;">
                    </div>
                    <div class="market-info-row" style="display: flex; justify-content: space-between; font-size: 10px;">
                        <span style="font-weight: bold;">NZD/USD:</span>
                        <input type="text" id="nzdUsdInput" value="${reportConfig.nzdUsd}" 
                               onchange="reportConfig.nzdUsd = this.value" 
                               style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 4px; border-radius: 3px; font-size: 10px; width: 70px; font-weight: normal;">
                    </div>
                </div>
            </div>
    `;
    
    // Add Indicator Chart
    if (indicators.length > 0) {
        html += `
            <div style="margin: 12px 0;">
                <div class="indicator-chart-container" style="position: relative; height: 240px; margin: 10px 0;">
                    <div id="indicatorChartLoading" style="text-align: center; padding: 40px; color: #666; font-size: 12px;">Loading indicator chart...</div>
                    <canvas id="indicatorChart" style="display: none;"></canvas>
                </div>
            </div>
        `;
    }
    
    // Add Sections with Tables in 2-column grid
    if (sections.length > 0) {
        html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0;">`;
        
        sections.forEach((section, sectionIndex) => {
            html += `
                <div class="section-container" style="page-break-inside: avoid;">
                    <h2 style="font-size: 12px; font-weight: 600; color: ${colors.primaryDark}; margin-bottom: 6px;">${section.title}</h2>
                    <table class="price-table" style="width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 8px;">
                        <thead>
                            <tr>
                                <th style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; background: ${colors.primaryDark}; color: ${colors.textOnPrimary}; font-weight: 600; font-size: 8px;">Type Name</th>
                                <th style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; background: ${colors.primaryDark}; color: ${colors.textOnPrimary}; font-weight: 600; font-size: 8px;">Current Price</th>
                                <th style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; background: ${colors.primaryDark}; color: ${colors.textOnPrimary}; font-weight: 600; font-size: 8px;">% Change</th>
                            </tr>
                        </thead>
                        <tbody id="section_${section.id}_table_body">
            `;
            
            // Add rows for each search in this section
            section.searchIds.forEach(searchId => {
                const search = savedSearches.find(s => s.id === searchId);
                const priceData = reportData[searchId];
                if (!search || !priceData) return;
                
                // Convert cents to dollars
                const price = priceData.current_price ? `$${(priceData.current_price / 100).toFixed(2)}` : 'N/A';
                const percentChange = priceData.percent_change !== null ? priceData.percent_change : null;
                const changeClass = percentChange !== null ? (percentChange >= 0 ? 'price-positive' : 'price-negative') : '';
                const changeDisplay = percentChange !== null ? 
                    `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%` : 'N/A';
                
                html += `
                    <tr>
                        <td style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; font-size: 8px;">${search.name}</td>
                        <td style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; font-size: 8px;">${price}</td>
                        <td style="padding: 4px 6px; text-align: left; border: 1px solid #ddd; font-size: 8px; ${changeClass ? `color: ${changeClass === 'price-positive' ? '#28a745' : '#dc3545'};` : ''}">${changeDisplay}</td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    // Add Market Commentary
    html += `
        <div style="margin: 12px 0;">
            <h2 style="font-size: 12px; font-weight: 600; color: ${colors.primaryDark}; margin-bottom: 8px;">Market Commentary</h2>
            <textarea id="marketCommentary" onchange="reportConfig.commentary = this.value" 
                      style="width: 100%; min-height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 10px; font-family: inherit; white-space: pre-wrap; word-wrap: break-word;"
                      placeholder="Enter market commentary...">${reportConfig.commentary}</textarea>
        </div>
    `;
    
    // Add Footer
    html += `
        <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; text-align: center;">
            <p style="font-size: 9px; color: #666; margin: 0;">Market report powered by FUSCA</p>
        </div>
    `;
    
    html += `</div>`;
    
    preview.innerHTML = html;
    
    // Render indicator chart if indicators exist (non-blocking - don't await)
    if (indicators.length > 0) {
        // Don't block report generation - load chart in background
        renderIndicatorChart().catch(error => {
            console.error('Indicator chart error (non-blocking):', error);
        });
    }
}

function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        reportConfig.logo = e.target.result;
        const preview = document.getElementById('logoPreview');
        if (preview) {
            preview.innerHTML = `<img src="${e.target.result}" style="max-height: 60px; max-width: 200px;">`;
        }
    };
    reader.readAsDataURL(file);
}

function handleHeroUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        reportConfig.heroImage = e.target.result;
        const container = document.querySelector('.hero-image-container');
        if (container) {
            container.innerHTML = `
                <input type="file" id="heroUpload" accept="image/*" onchange="handleHeroUpload(event)" style="display: none;">
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden;">
                    <img src="${e.target.result}" class="hero-image-preview" style="width: 100%; height: 100%; object-fit: cover; object-position: center; display: block;">
                    <button onclick="document.getElementById('heroUpload').click()" class="btn" style="position: absolute; bottom: 8px; right: 8px; font-size: 10px; padding: 4px 8px; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">Change Image</button>
                </div>
            `;
        }
    };
    reader.readAsDataURL(file);
}

// Helper function to convert blend data format for API
function convertBlendDataToApiFormat(blendData) {
    console.log('Converting blend data - FULL STRUCTURE:', JSON.stringify(blendData, null, 2));
    
    // Extract the blend structure from saved blend format
    // blendData is the saved search object - filters are stored at top level
    let entries = [];
    let weights = [];
    let entryFilters = [];
    let dateFilter = null;
    
    // Check top level first (this is how blends.js saves it to localStorage)
    if (blendData.entries) {
        entries = blendData.entries;
        weights = blendData.weights || [];
        entryFilters = blendData.entryFilters || [];
        dateFilter = blendData.dateFilter || null;
        console.log('Using top-level structure - entryFilters:', entryFilters);
    }
    // Fallback to blend_data structure (for server-logged format)
    else if (blendData.blend_data) {
        const blend = blendData.blend_data;
        entries = blend.entries || [];
        weights = blend.weights || [];
        entryFilters = blend.entryFilters || [];
        dateFilter = blend.dateFilter || null;
        console.log('Using blend_data structure - entryFilters:', entryFilters);
    }
    
    if (!entries || entries.length === 0) {
        console.error('No entries found in blend data:', blendData);
        throw new Error('Invalid blend data: no entries found');
    }
    
    // Ensure entryFilters array matches entries length
    while (entryFilters.length < entries.length) {
        entryFilters.push([]);
    }
    
    // Log detailed filter structure
    console.log('Entry filters structure:', {
        totalEntries: entries.length,
        entryFiltersLength: entryFilters.length,
        filtersByEntry: entryFilters.map((filters, idx) => ({
            entryIdx: idx,
            filterCount: filters ? filters.length : 0,
            filters: filters
        }))
    });
    
    // Convert to API format (matching blends.js structure exactly)
    const apiEntries = entries.map((entry, idx) => {
        const filtersForEntry = entryFilters[idx] || [];
        return {
            types: entry.types || [],
            label: entry.label || `Entry ${idx + 1}`,
            filters: filtersForEntry
        };
    });
    
    console.log('Converted API format:', { 
        entries: apiEntries.map(e => ({
            label: e.label,
            typesCount: e.types.length,
            filtersCount: e.filters.length,
            filters: e.filters
        }))
    });
    
    return { 
        entries: apiEntries,
        dateFilter: dateFilter
    };
}

// Helper function to extract date-based data (preserve individual sale dates)
function extractDateBasedData(dailyData, year) {
    try {
        console.log(`Extracting date-based data for year ${year}:`, dailyData);
        
        // Get all series data (first series in table_data)
        const tableData = dailyData.table_data || {};
        const seriesKeys = Object.keys(tableData);
        
        if (seriesKeys.length === 0) {
            console.warn(`No table_data found for year ${year}`);
            return { dates: [], prices: {} };
        }
        
        // Use the first (and likely only) series, or combine all if multiple
        let allDatesData = {};
        seriesKeys.forEach(key => {
            const seriesData = tableData[key] || {};
            Object.keys(seriesData).forEach(date => {
                // Filter to only dates within the specified year
                if (date.startsWith(year + '-')) {
                    if (!allDatesData[date]) {
                        allDatesData[date] = [];
                    }
                    const entry = seriesData[date];
                    const price = typeof entry === 'object' && entry !== null ? entry.price : entry;
                    if (price !== null && price !== undefined && !isNaN(price)) {
                        allDatesData[date].push(price);
                    }
                }
            });
        });
        
        // Average prices for dates that have multiple entries
        const pricesByDate = {};
        Object.keys(allDatesData).forEach(date => {
            if (allDatesData[date].length > 1) {
                const sum = allDatesData[date].reduce((a, b) => a + b, 0);
                pricesByDate[date] = parseFloat((sum / allDatesData[date].length).toFixed(2));
            } else if (allDatesData[date].length === 1) {
                pricesByDate[date] = parseFloat(allDatesData[date][0].toFixed(2));
            }
        });
        
        // Get sorted dates
        const dates = Object.keys(pricesByDate).sort();
        
        console.log(`Date-based data for ${year}: ${dates.length} dates`);
        return { dates, prices: pricesByDate };
    } catch (error) {
        console.error(`Error extracting date-based data for year ${year}:`, error);
        return { dates: [], prices: {} };
    }
}

async function renderIndicatorChart() {
    const canvas = document.getElementById('indicatorChart');
    const loadingDiv = document.getElementById('indicatorChartLoading');
    if (!canvas) return;
    
    // Show loading state
    if (loadingDiv) {
        loadingDiv.style.display = 'block';
        loadingDiv.textContent = 'Loading indicator chart...';
    }
    if (canvas) {
        canvas.style.display = 'none';
    }
    
    const currentYear = parseInt(reportConfig.year) || new Date().getFullYear();
    const previousYear = currentYear - 1;
    
    // Destroy existing chart if it exists
    if (indicatorChart) {
        indicatorChart.destroy();
        indicatorChart = null;
    }
    
    // Fetch data for all indicators in parallel using the fast blends API
    // Generate chart colors based on brand colors
    const brandPalette = generateColorPalette(reportConfig.primaryColor, reportConfig.secondaryColor);
    // Create a palette of colors for multiple indicators, starting with brand colors
    const colors = [
        brandPalette.primary,
        brandPalette.secondary,
        brandPalette.primaryLight,
        brandPalette.secondaryLight,
        '#3B82F6', // Fallback blue
        '#10B981', // Fallback green
        '#F59E0B', // Fallback orange
        '#EF4444', // Fallback red
        '#8B5CF6'  // Fallback purple
    ];
    
    // Update loading message to show progress
    if (loadingDiv && indicators.length > 0) {
        loadingDiv.textContent = `Loading ${indicators.length} indicator(s)...`;
    }
    
    // Helper function to add timeout to fetch
    const fetchWithTimeout = (url, options, timeout = 120000) => {
        return Promise.race([
            fetch(url, options),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), timeout)
            )
        ]);
    };
    
    // Process indicators sequentially to avoid connection conflicts
    const results = [];
    
    for (let i = 0; i < indicators.length; i++) {
        const indicator = indicators[i];
        const startTime = Date.now();
        console.log(`Fetching indicator ${i + 1}/${indicators.length}: ${indicator.name}`);
        
        try {
            // Convert blend data to API format
            const apiFormat = convertBlendDataToApiFormat(indicator.blendData);
            
            if (!apiFormat.entries || apiFormat.entries.length === 0) {
                throw new Error('No entries in API format');
            }
            
            // Debug: Log the filters being sent
            console.log(`Indicator ${indicator.name} filters:`, apiFormat.entries.map((e, idx) => ({
                label: e.label,
                types: e.types,
                filters: e.filters,
                filterCount: e.filters ? e.filters.length : 0
            })));
            
            // Update loading message to show progress
            if (loadingDiv) {
                loadingDiv.textContent = `Loading indicator ${i + 1}/${indicators.length}: ${indicator.name}...`;
            }
            
            // Fetch current year and previous year data sequentially (one after the other)
            // This avoids overwhelming database connections
            const currentYearPayload = {
                entries: apiFormat.entries,
                date_filter: {
                    operator: 'between',
                    value: `${currentYear}-01-01`,
                    value2: `${currentYear}-12-31`
                }
            };
            
            const previousYearPayload = {
                entries: apiFormat.entries,
                date_filter: {
                    operator: 'between',
                    value: `${previousYear}-01-01`,
                    value2: `${previousYear}-12-31`
                }
            };
            
            console.log(`Sending request for ${indicator.name} - current year:`, currentYearPayload);
            
            const currentResponse = await fetchWithTimeout('/api/compare_chart_blend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentYearPayload)
            }, 120000);
            
            const previousResponse = await fetchWithTimeout('/api/compare_chart_blend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(previousYearPayload)
            }, 120000);
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`Indicator ${indicator.name} responses received in ${elapsed}s`);
            
            if (!currentResponse.ok) {
                const errorText = await currentResponse.text();
                throw new Error(`Current year request failed: ${currentResponse.status} - ${errorText}`);
            }
            
            if (!previousResponse.ok) {
                const errorText = await previousResponse.text();
                throw new Error(`Previous year request failed: ${previousResponse.status} - ${errorText}`);
            }
            
            const currentData = await currentResponse.json();
            const previousData = await previousResponse.json();
            
            console.log(`Indicator ${indicator.name} data parsed, extracting dates...`);
            
            // Extract date-based data (preserve individual sale dates)
            const currentYearData = extractDateBasedData(currentData, currentYear);
            const previousYearData = extractDateBasedData(previousData, previousYear);
            
            const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`Indicator ${indicator.name} completed in ${totalElapsed}s`);
            
            results.push({
                indicator,
                data: {
                    currentYear: currentYearData,
                    previousYear: previousYearData
                },
                color: colors[i % colors.length]
            });
        } catch (error) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.error(`Error fetching indicator data for ${indicator.name} (after ${elapsed}s):`, error);
            results.push({ status: 'error', error: error.message, indicator: indicator.name });
        }
    }
    
    // Helper function to normalize date by stripping year (MM-DD format)
    // This allows dates from different years to overlap on the same timeline
    const normalizeDate = (dateStr) => {
        // dateStr is in format "YYYY-MM-DD", extract "MM-DD"
        const parts = dateStr.split('-');
        if (parts.length >= 3) {
            return `${parts[1]}-${parts[2]}`; // MM-DD
        }
        return dateStr;
    };
    
    // Collect all unique normalized dates (MM-DD) from all indicators
    // Store mapping from normalized date to all actual dates that map to it
    const normalizedDatesSet = new Set();
    const dateMapping = {}; // normalizedDate -> Set of actual dates
    
    results.forEach((result) => {
        if (!result || result.status === 'error') return;
        
        // Process current year dates
        if (result.data && result.data.currentYear && result.data.currentYear.dates) {
            result.data.currentYear.dates.forEach(actualDate => {
                const normalized = normalizeDate(actualDate);
                normalizedDatesSet.add(normalized);
                if (!dateMapping[normalized]) {
                    dateMapping[normalized] = new Set();
                }
                dateMapping[normalized].add(actualDate);
            });
        }
        
        // Process previous year dates
        if (result.data && result.data.previousYear && result.data.previousYear.dates) {
            result.data.previousYear.dates.forEach(actualDate => {
                const normalized = normalizeDate(actualDate);
                normalizedDatesSet.add(normalized);
                if (!dateMapping[normalized]) {
                    dateMapping[normalized] = new Set();
                }
                dateMapping[normalized].add(actualDate);
            });
        }
    });
    
    // Sort normalized dates chronologically (MM-DD format sorts correctly)
    const sortedNormalizedDates = Array.from(normalizedDatesSet).sort();
    
    // Build datasets from all results
    // IMPORTANT: Add previous year datasets first so they render underneath
    const datasets = [];
    const errors = [];
    
    // First pass: Add all previous year datasets (so they render behind/underneath)
    results.forEach((result) => {
        if (!result || result.status === 'error' || result.status === 'timeout') {
            if (result && result.status === 'error') {
                errors.push(result.indicator || 'Unknown');
            }
            return;
        }
        
        const { indicator, data, color } = result;
        const colorRgb = hexToRgb(color);
        
        // Add previous year data at 50% opacity (same color) - FIRST so it renders underneath
        if (data.previousYear && data.previousYear.dates && data.previousYear.dates.length > 0) {
            // Map prices to normalized dates (null for missing dates)
            const previousYearValues = sortedNormalizedDates.map(normalizedDate => {
                // Find any date from previous year that matches this normalized date
                const matchingDates = Array.from(dateMapping[normalizedDate] || []).filter(date => {
                    return data.previousYear.dates.includes(date);
                });
                
                if (matchingDates.length === 0) return null;
                
                // If multiple dates match (shouldn't happen for same year), average them
                const prices = matchingDates
                    .map(date => data.previousYear.prices[date])
                    .filter(price => price !== null && price !== undefined);
                
                if (prices.length === 0) return null;
                if (prices.length === 1) return prices[0];
                
                // Average multiple prices (unlikely but handle it)
                const sum = prices.reduce((a, b) => a + b, 0);
                return parseFloat((sum / prices.length).toFixed(2));
            });
            
            datasets.push({
                label: `${indicator.name} (${previousYear})`,
                data: previousYearValues,
                borderColor: `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.5)`,
                backgroundColor: `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.1)`,
                fill: false,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 4,
                borderDash: [5, 5],
                spanGaps: true // Connect sequential points, skip null values
            });
        }
    });
    
    // Second pass: Add all current year datasets (so they render on top)
    results.forEach((result) => {
        if (!result || result.status === 'error' || result.status === 'timeout') {
            return;
        }
        
        const { indicator, data, color } = result;
        const colorRgb = hexToRgb(color);
        
        // Add current year data - AFTER previous year so it renders on top
        if (data.currentYear && data.currentYear.dates && data.currentYear.dates.length > 0) {
            // Map prices to normalized dates (null for missing dates)
            const currentYearValues = sortedNormalizedDates.map(normalizedDate => {
                // Find any date from current year that matches this normalized date
                const matchingDates = Array.from(dateMapping[normalizedDate] || []).filter(date => {
                    return data.currentYear.dates.includes(date);
                });
                
                if (matchingDates.length === 0) return null;
                
                // If multiple dates match (shouldn't happen for same year), average them
                const prices = matchingDates
                    .map(date => data.currentYear.prices[date])
                    .filter(price => price !== null && price !== undefined);
                
                if (prices.length === 0) return null;
                if (prices.length === 1) return prices[0];
                
                // Average multiple prices (unlikely but handle it)
                const sum = prices.reduce((a, b) => a + b, 0);
                return parseFloat((sum / prices.length).toFixed(2));
            });
            
            datasets.push({
                label: `${indicator.name} (${currentYear})`,
                data: currentYearValues,
                borderColor: color,
                backgroundColor: `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.2)`,
                fill: false,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5,
                spanGaps: true // Connect sequential points, skip null values
            });
        }
    });
    
    // Check if we have data
    if (datasets.length === 0) {
        console.warn('No indicator data available to display');
        if (loadingDiv) {
            let errorMsg = 'No indicator data available';
            if (errors.length > 0) {
                errorMsg += ' (some requests failed or timed out)';
            }
            loadingDiv.textContent = errorMsg;
            loadingDiv.style.display = 'block';
        }
        if (canvas) {
            canvas.style.display = 'none';
        }
        return;
    }
    
    // Log warnings if some indicators failed
    if (errors.length > 0) {
        console.warn('Some indicators failed to load:', errors);
    }
    
    // Create chart (hide loading after chart is created)
    try {
        if (canvas) {
            canvas.style.display = 'block';
        }
        
        // Format normalized dates for chart labels (e.g., "01-15" -> "Jan 15")
        const formatNormalizedDateLabel = (normalizedDateStr) => {
            // normalizedDateStr is in format "MM-DD"
            const parts = normalizedDateStr.split('-');
            if (parts.length === 2) {
                const month = parseInt(parts[0], 10) - 1; // 0-indexed months
                const day = parseInt(parts[1], 10);
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${months[month]} ${day}`;
            }
            return normalizedDateStr;
        };
        
        const dateLabels = sortedNormalizedDates.map(formatNormalizedDateLabel);
        
        indicatorChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: dateLabels,
                datasets: datasets
            },
            options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 10,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += '$' + context.parsed.y.toFixed(2);
                            } else {
                                label += 'N/A';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Price ($)',
                        font: { size: 10, weight: 'bold' }
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        },
                        font: { size: 9 }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Sale Date',
                        font: { size: 10, weight: 'bold' }
                    },
                    ticks: {
                        font: { size: 9 },
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            animation: {
                onComplete: function() {
                    // Ensure loading div is hidden after chart animation completes
                    const loadingDiv = document.getElementById('indicatorChartLoading');
                    if (loadingDiv) {
                        loadingDiv.style.display = 'none';
                        loadingDiv.innerHTML = '';
                    }
                }
            }
        }
        });
        
        // Hide loading div immediately (don't wait for animation)
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
            loadingDiv.innerHTML = '';
        }
    } catch (chartError) {
        console.error('Error creating indicator chart:', chartError);
        if (loadingDiv) {
            loadingDiv.textContent = 'Error creating chart. Please try again.';
            loadingDiv.style.display = 'block';
        }
        if (canvas) {
            canvas.style.display = 'none';
        }
    }
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

async function exportPDF() {
    const preview = document.getElementById('reportPreview');
    if (!preview || preview.innerHTML.includes('Configure your report')) {
        alert('Please generate a report first before exporting');
        return;
    }
    
    try {
        // Store original content
        const originalHTML = preview.innerHTML;
        
        // Replace input fields with text values (but skip file inputs)
        const inputs = preview.querySelectorAll('input:not([type="file"]), textarea');
        const replacements = [];
        inputs.forEach(input => {
            const parent = input.parentElement;
            const value = input.value || '';
            const span = document.createElement('span');
            span.textContent = value;
            span.style.cssText = window.getComputedStyle(input).cssText;
            span.style.border = 'none';
            span.style.background = 'transparent';
            span.style.padding = '0';
            
            // For textarea, preserve line breaks
            if (input.tagName === 'TEXTAREA') {
                span.style.whiteSpace = 'pre-wrap';
                span.style.wordWrap = 'break-word';
                span.style.display = 'block';
                span.style.width = '100%';
            }
            
            replacements.push({ input, span, parent });
            parent.replaceChild(span, input);
        });
        
        // Hide labels and buttons that are associated with file uploads
        const labels = preview.querySelectorAll('label');
        labels.forEach(label => {
            const forAttr = label.getAttribute('for');
            if (forAttr) {
                const associatedInput = preview.querySelector(`#${forAttr}`);
                if (associatedInput && associatedInput.type === 'file') {
                    label.style.display = 'none';
                }
            }
            // Also hide labels that contain "Logo:" or are near file inputs
            if (label.textContent && label.textContent.toLowerCase().includes('logo')) {
                const nextSibling = label.nextElementSibling;
                if (nextSibling && nextSibling.type === 'file') {
                    label.style.display = 'none';
                }
            }
        });
        
        // Hide all buttons
        const buttons = preview.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.style.display = 'none';
        });
        
        // Hide all file inputs completely (they might show file paths)
        const fileInputs = preview.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            input.style.display = 'none';
            input.style.visibility = 'hidden';
            input.style.opacity = '0';
            input.style.position = 'absolute';
            input.style.width = '0';
            input.style.height = '0';
        });
        
        // Wait for all images to fully load before capturing
        const allImages = preview.querySelectorAll('img');
        const imageLoadPromises = Array.from(allImages).map(img => {
            return new Promise((resolve) => {
                if (img.complete && img.naturalWidth > 0) {
                    resolve();
                } else {
                    img.onload = resolve;
                    img.onerror = resolve;
                    setTimeout(resolve, 3000); // 3 second timeout per image
                }
            });
        });
        await Promise.all(imageLoadPromises);
        
        // Fix hero image to always fill container
        const heroContainer = preview.querySelector('.hero-image-container');
        const heroImg = preview.querySelector('.hero-image-preview');
        if (heroImg && heroContainer) {
            heroContainer.style.height = '150px';
            heroContainer.style.width = '100%';
            heroContainer.style.overflow = 'hidden';
            heroContainer.style.position = 'relative';
            
            const wrapper = heroImg.parentElement;
            if (wrapper && wrapper !== heroContainer) {
                wrapper.style.position = 'absolute';
                wrapper.style.top = '0';
                wrapper.style.left = '0';
                wrapper.style.width = '100%';
                wrapper.style.height = '100%';
                wrapper.style.overflow = 'hidden';
                wrapper.style.margin = '0';
                wrapper.style.padding = '0';
            }
            
            // Ensure image fills container completely
            heroImg.style.width = '100%';
            heroImg.style.height = '100%';
            heroImg.style.objectFit = 'cover';
            heroImg.style.objectPosition = 'center';
            heroImg.style.display = 'block';
        }
        
        // Additional wait to ensure everything is rendered
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Use html2canvas to capture the report
        const canvas = await html2canvas(preview, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            allowTaint: true,
            imageTimeout: 15000
        });
        
        // Restore original HTML
        preview.innerHTML = originalHTML;
        
        // Re-render chart if needed
        if (indicators.length > 0) {
            await renderIndicatorChart();
        }
        
        // Convert to PDF using jsPDF
        const { jsPDF } = window.jspdf;
        const imgData = canvas.toDataURL('image/png');
        
        // Calculate dimensions
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const pdfWidth = 210; // A4 width in mm
        const pdfHeight = (imgHeight * pdfWidth) / imgWidth;
        
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        // If content is taller than one page, split across pages
        let heightLeft = pdfHeight;
        let position = 0;
        
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= 297; // A4 height in mm
        
        while (heightLeft > 0) {
            position = heightLeft - pdfHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= 297;
        }
        
        // Save the PDF
        const filename = `market_report_${reportConfig.year || new Date().getFullYear()}_${Date.now()}.pdf`;
        pdf.save(filename);
        
    } catch (error) {
        console.error('Error exporting PDF:', error);
        alert('Error exporting PDF: ' + error.message);
    }
}

async function exportPNG() {
    const preview = document.getElementById('reportPreview');
    if (!preview || preview.innerHTML.includes('Configure your report')) {
        alert('Please generate a report first before exporting');
        return;
    }
    
    try {
        // Store original content
        const originalHTML = preview.innerHTML;
        
        // Replace input fields with text values
        const inputs = preview.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            const parent = input.parentElement;
            const value = input.value || '';
            const span = document.createElement('span');
            span.textContent = value;
            span.style.cssText = window.getComputedStyle(input).cssText;
            span.style.border = 'none';
            span.style.background = 'transparent';
            span.style.padding = '0';
            
            // For textarea, preserve line breaks
            if (input.tagName === 'TEXTAREA') {
                span.style.whiteSpace = 'pre-wrap';
                span.style.wordWrap = 'break-word';
                span.style.display = 'block';
                span.style.width = '100%';
            }
            
            parent.replaceChild(span, input);
        });
        
        // Hide all buttons
        const buttons = preview.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.style.display = 'none';
        });
        
        // Hide all file inputs completely (they might show file paths)
        const fileInputs = preview.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            input.style.display = 'none';
            input.style.visibility = 'hidden';
            input.style.opacity = '0';
            input.style.position = 'absolute';
            input.style.width = '0';
            input.style.height = '0';
        });
        
        // Wait for all images to fully load before capturing
        const allImages = preview.querySelectorAll('img');
        const imageLoadPromises = Array.from(allImages).map(img => {
            return new Promise((resolve) => {
                if (img.complete && img.naturalWidth > 0) {
                    resolve();
                } else {
                    img.onload = resolve;
                    img.onerror = resolve;
                    setTimeout(resolve, 3000); // 3 second timeout per image
                }
            });
        });
        await Promise.all(imageLoadPromises);
        
        // Fix hero image to always fill container
        const heroContainer = preview.querySelector('.hero-image-container');
        const heroImg = preview.querySelector('.hero-image-preview');
        if (heroImg && heroContainer) {
            heroContainer.style.height = '150px';
            heroContainer.style.width = '100%';
            heroContainer.style.overflow = 'hidden';
            heroContainer.style.position = 'relative';
            
            const wrapper = heroImg.parentElement;
            if (wrapper && wrapper !== heroContainer) {
                wrapper.style.position = 'absolute';
                wrapper.style.top = '0';
                wrapper.style.left = '0';
                wrapper.style.width = '100%';
                wrapper.style.height = '100%';
                wrapper.style.overflow = 'hidden';
                wrapper.style.margin = '0';
                wrapper.style.padding = '0';
            }
            
            // Ensure image fills container completely
            heroImg.style.width = '100%';
            heroImg.style.height = '100%';
            heroImg.style.objectFit = 'cover';
            heroImg.style.objectPosition = 'center';
            heroImg.style.display = 'block';
        }
        
        // Additional wait to ensure everything is rendered
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Use html2canvas to capture the report
        const canvas = await html2canvas(preview, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            allowTaint: true,
            imageTimeout: 15000
        });
        
        // Restore original HTML
        preview.innerHTML = originalHTML;
        
        // Re-render chart if needed
        if (indicators.length > 0) {
            await renderIndicatorChart();
        }
        
        // Convert to blob and download
        canvas.toBlob(function(blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const filename = `market_report_${reportConfig.year || new Date().getFullYear()}_${Date.now()}.png`;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 'image/png');
        
    } catch (error) {
        console.error('Error exporting PNG:', error);
        alert('Error exporting PNG: ' + error.message);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadSavedSearches();
    renderIndicators();
    fetchMostRecentSaleDate();
    syncColorPickers(); // Initialize color pickers with default values
    
    // Close modal on outside click
    const modal = document.getElementById('indicatorBuilderModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeIndicatorBuilder();
            }
        });
    }
});

// Helper function to compress base64 image data
function compressImage(base64DataUrl, maxWidth, maxHeight, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (!base64DataUrl) {
            resolve(null);
            return;
        }
        
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Calculate new dimensions while maintaining aspect ratio
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = width * ratio;
                height = height * ratio;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to compressed base64
            const compressed = canvas.toDataURL('image/jpeg', quality);
            resolve(compressed);
        };
        
        img.onerror = function() {
            reject(new Error('Failed to load image'));
        };
        
        img.src = base64DataUrl;
    });
}

async function saveReportLayout() {
    const name = prompt('Enter a name for this report layout:');
    if (!name) return;
    
    try {
        // Compress images before saving to reduce localStorage size
        let compressedLogo = null;
        let compressedHero = null;
        
        if (reportConfig.logo) {
            try {
                compressedLogo = await compressImage(reportConfig.logo, 400, 200, 0.7);
                console.log('Logo compressed:', reportConfig.logo.length, '->', compressedLogo ? compressedLogo.length : 0);
            } catch (e) {
                console.warn('Failed to compress logo:', e);
                compressedLogo = reportConfig.logo; // Fallback to original
            }
        }
        
        if (reportConfig.heroImage) {
            try {
                compressedHero = await compressImage(reportConfig.heroImage, 1200, 300, 0.7);
                console.log('Hero image compressed:', reportConfig.heroImage.length, '->', compressedHero ? compressedHero.length : 0);
            } catch (e) {
                console.warn('Failed to compress hero image:', e);
                compressedHero = reportConfig.heroImage; // Fallback to original
            }
        }
        
        const layout = {
            id: Date.now(),
            name: name,
            sections: sections,
            indicators: indicators,
            selectedSearches: Array.from(selectedSearches),
            reportConfig: {
                title: reportConfig.title,
                year: reportConfig.year,
                saleDate: reportConfig.saleDate,
                nextAuction: reportConfig.nextAuction,
                offering: reportConfig.offering,
                passings: reportConfig.passings,
                nzdUsd: reportConfig.nzdUsd,
                commentary: reportConfig.commentary,
                logo: compressedLogo,
                heroImage: compressedHero
            },
            created: new Date().toISOString()
        };
        
        // Try to save, with cleanup if quota exceeded
        try {
            let savedLayouts = JSON.parse(localStorage.getItem('fusca_report_layouts') || '[]');
            savedLayouts.push(layout);
            localStorage.setItem('fusca_report_layouts', JSON.stringify(savedLayouts));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                // Remove oldest layouts to free up space
                let savedLayouts = JSON.parse(localStorage.getItem('fusca_report_layouts') || '[]');
                // Sort by creation date and keep only the 5 most recent
                savedLayouts.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
                savedLayouts = savedLayouts.slice(0, 5);
                
                // Try again
                savedLayouts.push(layout);
                localStorage.setItem('fusca_report_layouts', JSON.stringify(savedLayouts));
                alert(`Report layout saved, but older layouts were removed to free up space.`);
            } else {
                throw e;
            }
        }
        
        // Send to server logs (images are already compressed)
        fetch('/api/log_saved_search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                type: 'report_layout',
                layout: layout
            })
        }).catch(e => console.warn('Failed to log report layout:', e));
        
        alert(`Report layout "${name}" saved successfully!`);
    } catch (error) {
        console.error('Error saving report layout:', error);
        alert(`Failed to save report layout: ${error.message}`);
    }
}

function deleteReportLayout(layoutId) {
    if (!confirm('Delete this saved report layout?')) return;
    
    let savedLayouts = JSON.parse(localStorage.getItem('fusca_report_layouts') || '[]');
    savedLayouts = savedLayouts.filter(l => l.id !== layoutId);
    localStorage.setItem('fusca_report_layouts', JSON.stringify(savedLayouts));
    
    alert('Report layout deleted successfully!');
}

// Sync color picker UI with reportConfig
function syncColorPickers() {
    const primaryPicker = document.getElementById('primaryColorPicker');
    const primaryText = document.getElementById('primaryColorText');
    const secondaryPicker = document.getElementById('secondaryColorPicker');
    const secondaryText = document.getElementById('secondaryColorText');
    
    if (primaryPicker && primaryText) {
        primaryPicker.value = reportConfig.primaryColor || '#1A4C41';
        primaryText.value = reportConfig.primaryColor || '#1A4C41';
    }
    if (secondaryPicker && secondaryText) {
        secondaryPicker.value = reportConfig.secondaryColor || '#3D7F4B';
        secondaryText.value = reportConfig.secondaryColor || '#3D7F4B';
    }
}

function loadReportLayout() {
    const savedLayouts = JSON.parse(localStorage.getItem('fusca_report_layouts') || '[]');
    
    if (savedLayouts.length === 0) {
        alert('No saved report layouts found.');
        return;
    }
    
    // Sort by creation date (newest first)
    const sortedLayouts = [...savedLayouts].sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
    
    // Build a formatted list with size info
    const layoutList = sortedLayouts.map((l, idx) => {
        const layoutSize = JSON.stringify(l).length;
        const sizeKB = (layoutSize / 1024).toFixed(1);
        const createdDate = l.created ? new Date(l.created).toLocaleDateString() : 'Unknown';
        return `${idx + 1}. ${l.name} (${sizeKB} KB, ${createdDate})`;
    }).join('\n');
    
    const choice = prompt(`Choose a layout to load:\n\n${layoutList}\n\nEnter the number, or type "delete" followed by the number to delete a layout:`);
    
    if (!choice) return;
    
    // Check if it's a delete command
    if (choice.toLowerCase().startsWith('delete')) {
        const parts = choice.trim().split(/\s+/);
        if (parts.length >= 2) {
            const deleteIndex = parseInt(parts[1]) - 1;
            if (!isNaN(deleteIndex) && deleteIndex >= 0 && deleteIndex < sortedLayouts.length) {
                deleteReportLayout(sortedLayouts[deleteIndex].id);
                return;
            }
        }
        alert('Invalid delete command. Format: "delete 1" to delete layout #1');
        return;
    }
    
    // It's a load command
    const index = parseInt(choice) - 1;
    if (isNaN(index) || index < 0 || index >= sortedLayouts.length) {
        alert('Invalid selection.');
        return;
    }
    
    const layout = sortedLayouts[index];
    
    // Load the layout
    sections = layout.sections || [];
    indicators = layout.indicators || [];
    selectedSearches = new Set(layout.selectedSearches || []);
    
    // Load report config
    if (layout.reportConfig) {
        reportConfig = { ...reportConfig, ...layout.reportConfig };
    }
    
    // Sync color pickers with loaded colors
    syncColorPickers();
    
    // Re-render everything
    renderSavedSearches();
    renderSections();
    renderIndicators();
    
    alert(`Report layout "${layout.name}" loaded successfully!`);
}

function manageReportLayouts() {
    const savedLayouts = JSON.parse(localStorage.getItem('fusca_report_layouts') || '[]');
    
    if (savedLayouts.length === 0) {
        alert('No saved report layouts found.');
        return;
    }
    
    // Sort by creation date (newest first)
    const sortedLayouts = [...savedLayouts].sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
    
    // Build a formatted list with size info
    const layoutList = sortedLayouts.map((l, idx) => {
        const layoutSize = JSON.stringify(l).length;
        const sizeKB = (layoutSize / 1024).toFixed(1);
        const createdDate = l.created ? new Date(l.created).toLocaleDateString() : 'Unknown';
        return `${idx + 1}. ${l.name} (${sizeKB} KB, ${createdDate})`;
    }).join('\n');
    
    const totalSize = savedLayouts.reduce((sum, l) => sum + JSON.stringify(l).length, 0);
    const totalSizeKB = (totalSize / 1024).toFixed(1);
    
    const choice = prompt(`Manage Report Layouts (${savedLayouts.length} saved, ${totalSizeKB} KB total)\n\n${layoutList}\n\nEnter a number to load, or "delete" followed by a number to delete:`);
    
    if (!choice) return;
    
    // Check if it's a delete command
    if (choice.toLowerCase().startsWith('delete')) {
        const parts = choice.trim().split(/\s+/);
        if (parts.length >= 2) {
            const deleteIndex = parseInt(parts[1]) - 1;
            if (!isNaN(deleteIndex) && deleteIndex >= 0 && deleteIndex < sortedLayouts.length) {
                deleteReportLayout(sortedLayouts[deleteIndex].id);
                // Refresh the list
                manageReportLayouts();
                return;
            }
        }
        alert('Invalid delete command. Format: "delete 1" to delete layout #1');
        return;
    }
    
    // It's a load command
    const index = parseInt(choice) - 1;
    if (isNaN(index) || index < 0 || index >= sortedLayouts.length) {
        alert('Invalid selection.');
        return;
    }
    
    const layout = sortedLayouts[index];
    
    // Load the layout
    sections = layout.sections || [];
    indicators = layout.indicators || [];
    selectedSearches = new Set(layout.selectedSearches || []);
    
    // Load report config
    if (layout.reportConfig) {
        reportConfig = { ...reportConfig, ...layout.reportConfig };
    }
    
    // Sync color pickers with loaded colors
    syncColorPickers();
    
    // Re-render everything
    renderSavedSearches();
    renderSections();
    renderIndicators();
    
    alert(`Report layout "${layout.name}" loaded successfully!`);
}

// Fetch most recent sale date on page load
async function fetchMostRecentSaleDate() {
    try {
        const response = await fetch('/api/market_report/most_recent_date');
        if (response.ok) {
            const data = await response.json();
            if (data.mostRecentDate) {
                reportConfig.saleDate = data.mostRecentDate;
                
                // Also fetch offering and passings for this date
                try {
                    const saleDataResponse = await fetch('/api/market_report/sale_stats', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ saleDate: data.mostRecentDate })
                    });
                    
                    if (saleDataResponse.ok) {
                        const saleData = await saleDataResponse.json();
                        reportConfig.offering = saleData.totalBales || '';
                        reportConfig.passings = saleData.passings || '';
                    }
                } catch (error) {
                    console.error('Error fetching sale stats:', error);
                }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('Request for most recent date timed out');
        } else {
            console.error('Error fetching most recent sale date:', error);
        }
    }
}

console.log('Market Reports ready');

