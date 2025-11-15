# Fusca Pro Lookup - Iframe Pages Usage Guide

## Overview

The Fusca Pro Lookup application includes iframe-ready versions of all main pages. These pages are designed to be embedded in external websites or applications while maintaining full functionality and consistent styling.

**Base Domain:** https://dataengine.fusca.co.nz/

## Available Iframe Pages

### 1. Simple Search
**URL:** `https://dataengine.fusca.co.nz/simple-iframe`

A streamlined search interface for querying wool auction data with filters, date ranges, and results visualization.

### 2. Compare Types
**URL:** `https://dataengine.fusca.co.nz/compare-iframe`

Compare up to 5 wool types side-by-side with price trend analysis.

### 3. Advanced Blends
**URL:** `https://dataengine.fusca.co.nz/blends-iframe`

Create weighted blends of multiple wool types with custom filters and date ranges.

### 4. Advanced Metrics
**URL:** `https://dataengine.fusca.co.nz/metrics-iframe`

Statistical analysis tools including:
- Distribution Analysis
- Time Series Analysis
- Value Drivers (Regression)
- What-If Scenario Analysis
- Benchmark Your Lot

## Key Features

### Design Consistency
- All iframe pages use the same native components as the main pages
- Consistent styling with Nunito Sans font family
- No navigation bar (removed for iframe context)
- No intro headers (cleaner embedded appearance)
- Same functionality as main pages

### Styling
- Font: Nunito Sans with system fallbacks
- Responsive design (mobile-friendly)
- Consistent color scheme and component styling
- All styles inherited from `base.html` and `styles.css`

## Implementation

### Basic HTML Embed

```html
<iframe 
    src="https://dataengine.fusca.co.nz/simple-iframe" 
    width="100%" 
    height="800px" 
    frameborder="0"
    style="border: 1px solid #ddd; border-radius: 8px;">
</iframe>
```

### Responsive Embed (Recommended)

```html
<div style="position: relative; padding-bottom: 75%; height: 0; overflow: hidden; max-width: 100%;">
    <iframe 
        src="https://dataengine.fusca.co.nz/simple-iframe" 
        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 1px solid #ddd; border-radius: 8px;"
        frameborder="0"
        allowfullscreen>
    </iframe>
</div>
```

### React/Next.js Example

```jsx
<iframe
    src="https://dataengine.fusca.co.nz/metrics-iframe"
    width="100%"
    height="1000px"
    style={{ border: '1px solid #ddd', borderRadius: '8px' }}
    title="Fusca Pro Metrics"
/>
```

### Vue.js Example

```vue
<template>
    <iframe
        :src="iframeUrl"
        width="100%"
        height="800px"
        frameborder="0"
        style="border: 1px solid #ddd; border-radius: 8px;"
    />
</template>

<script>
export default {
    data() {
        return {
            iframeUrl: 'https://dataengine.fusca.co.nz/blends-iframe'
        }
    }
}
</script>
```

## Page-Specific Considerations

### Simple Search
- **Recommended height:** 800-1000px
- Includes search, filters, charts, and results table
- Results table can expand, so allow for dynamic height if possible

### Compare Types
- **Recommended height:** 600-800px
- Best for comparing 2-5 wool types
- Chart visualization is the primary output

### Advanced Blends
- **Recommended height:** 900-1200px
- More complex interface with blend configuration
- Includes saved blends functionality

### Advanced Metrics
- **Recommended height:** 1000-1400px
- Most complex page with multiple analysis tabs
- Includes regression analysis, scenario modeling, and benchmarking

## Styling Customization

The iframe pages inherit all styles from the main application. If you need to customize the appearance within your embedding context:

### Option 1: CSS Override (External)
```css
/* Target elements within the iframe */
iframe {
    border: 2px solid #3D7F4B !important;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}
```

### Option 2: Container Styling
```html
<div class="fusca-iframe-container" style="background: #f5f5f5; padding: 20px;">
    <iframe src="https://dataengine.fusca.co.nz/simple-iframe" ...></iframe>
</div>
```

## Technical Details

### Routes
All iframe routes follow the pattern: `/{page}-iframe`

- `/simple-iframe` - Simple Search
- `/compare-iframe` - Compare Types  
- `/blends-iframe` - Advanced Blends
- `/metrics-iframe` - Advanced Metrics

### Differences from Main Pages

1. **Navigation Bar:** Hidden (set via `hide_nav = True`)
2. **Intro Headers:** Removed (cleaner embedded appearance)
3. **Container Margin:** Adjusted for iframe context
4. **All other functionality:** Identical to main pages

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive
- Requires JavaScript enabled
- Uses Chart.js for visualizations

## Security & Permissions

### CORS
The iframe pages are designed to be embedded cross-origin. Ensure your embedding page doesn't have restrictive CSP headers that block iframes.

### Content Security Policy
If you're setting CSP headers, include:
```
frame-src https://dataengine.fusca.co.nz;
```

## Performance Considerations

1. **Initial Load:** Pages load Chart.js and other dependencies (~500KB)
2. **Data Fetching:** API calls are made on-demand when users interact
3. **Caching:** Static assets are cached with versioning (`?v=3.0`)
4. **Lazy Loading:** Consider lazy-loading iframes that are below the fold

## Troubleshooting

### Iframe Not Displaying
- Check browser console for CORS errors
- Verify the URL is correct and accessible
- Ensure iframe is not blocked by browser extensions

### Styling Issues
- Clear browser cache (CSS is versioned)
- Check for conflicting CSS in parent page
- Verify iframe has sufficient width/height

### Functionality Issues
- Ensure JavaScript is enabled
- Check browser console for errors
- Verify API endpoints are accessible from iframe context

## Support

For issues or questions:
- Check the main application at https://dataengine.fusca.co.nz/
- Review browser console for error messages
- Verify network connectivity and API accessibility

## Version History

- **v1.0** - Initial iframe pages with consistent styling
- Font updated to Nunito Sans
- Navigation and headers removed for iframe context
- All pages use native components from main application

