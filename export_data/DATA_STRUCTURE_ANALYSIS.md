# Export Data Structure Analysis

## File Structure

### Monthly Files
- **Format**: `{Month}_{Year}_Exports_HS10_by_Country.csv`
- **Examples**: `Jan_2025_Exports_HS10_by_Country.csv`, `Sep_2025_Exports_HS10_by_Country.csv`
- **Date Format**: Single month per file, stored as `YYYYMM` (e.g., `202501` for January 2025)
- **Size**: ~3-5 MB per file
- **Rows**: ~17,000 rows per month

### Yearly Files
- **Format**: `{Year}_Exports_HS10_by_Country.csv`
- **Examples**: `2024_Exports_HS10_by_Country.csv`, `2023_Exports_HS10_by_Country.csv`
- **Date Format**: All 12 months aggregated in one file, stored as `YYYYMM` (e.g., `202401`, `202402`, ..., `202412`)
- **Size**: ~44-48 MB per file
- **Rows**: ~270,000 rows per year

## Date Format Consistency

✅ **Both monthly and yearly files use the same date format: `YYYYMM`**
- Monthly files: Single month (e.g., `202501`)
- Yearly files: Multiple months (e.g., `202401`, `202402`, ..., `202412`)

## Column Structure

Both file types have identical column structure:

1. `month` - Date in YYYYMM format (integer)
2. `hs` - HS10 code (10-digit Harmonized System code)
3. `hs_desc` - Description of the HS code
4. `uom` - Unit of measure (e.g., KGM, NMB, MTK)
5. `country` - Destination country
6. `Export_FOB` - Export value (Free On Board) in NZD
7. `Export_Qty` - Export quantity
8. `Re_export_FOB` - Re-export value in NZD
9. `Re_export_Qty` - Re-export quantity
10. `total_export_FOB` - Total export value (Export + Re-export)
11. `total_export_qty` - Total export quantity (Export + Re-export)
12. `status` - Data status (typically "Final")

## Wool-Related HS Codes (Chapter 51)

### 1. Greasy Wool (510111xxxx)
- **5101110002**: Less than 24.5 microns
- **5101110004**: 24.5 to 31.4 microns
- **5101110006**: Exceeding 31.4, but not exceeding 35.4 microns
- **5101110008**: Exceeding 35.4 microns

### 2. Degreased/Scoured Wool (510121xxxx)
- **5101210002**: Less than 24.5 microns
- **5101210004**: 24.5 to 31.4 microns
- **5101210006**: Exceeding 31.4, but not exceeding 35.4 microns
- **5101210008**: Exceeding 35.4 microns

### 3. Carded Wool (510510xxxx)
- **5105100000**: Wool; carded

### 4. Combed Wool / Tops (510521xxxx)
- **5105210000**: Wool; wool tops and other combed wool

### 5. Yarn for Carpet (85%+ wool)
- **5106100101**: Yarn; of carded wool, containing 85% or more by weight of wool, for use in the manufacture of carpets

### 6. Other Yarns (85%+ wool)
- **5109100001**: Yarn; containing by weight 85% or more wool or fine animal hair
- **5109100009**: Yarn; containing by weight 85% or more wool or fine animal hair
- **5109100019**: Yarn; containing by weight 85% or more wool or fine animal hair

### 7. Yarns (<85% wool)
- **5109900001**: Yarn; containing by weight less than 85% wool or fine animal hair
- **5109900019**: Yarn; containing by weight less than 85% wool or fine animal hair

## Key Observations

1. **Micron Splits**: Greasy and degreased wool are split by micron ranges:
   - Fine: < 24.5 microns
   - Medium: 24.5-31.4 microns
   - Coarse: 31.4-35.4 microns
   - Very Coarse: > 35.4 microns

2. **Processing Stages**:
   - Greasy (raw)
   - Degreased/Scoured
   - Carded
   - Combed (tops)
   - Yarn

3. **Unit of Measure**: Most wool products use `KGM` (kilograms), but some finished products may use `MTK` (square meters) or `NMB` (number)

## Next Steps for Interactive Tool

1. Create a data loader that can handle both monthly and yearly files
2. Build filters for:
   - HS code categories (greasy, degreased, carded, combed, yarn)
   - Micron ranges
   - Countries
   - Date ranges
3. Create visualizations for:
   - Volume trends over time
   - Value trends over time
   - Country breakdowns
   - Micron distribution
   - Processing stage analysis

