"""
Export Data Loader
Handles loading and processing of export data files (monthly and yearly)
"""

import pandas as pd
import os
from datetime import datetime
from pathlib import Path

# Base directory for export data files
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXPORT_DATA_DIR = os.path.join(BASE_DIR, 'export_data')

# Wool-related HS codes (Chapter 51)
WOOL_HS_CODES = {
    # Greasy wool
    'greasy_fine': ['5101110002'],  # < 24.5 microns
    'greasy_medium': ['5101110004'],  # 24.5-31.4 microns
    'greasy_coarse': ['5101110006'],  # 31.4-35.4 microns
    'greasy_very_coarse': ['5101110008'],  # > 35.4 microns
    
    # Degreased/scoured wool
    'degreased_fine': ['5101210002'],  # < 24.5 microns
    'degreased_medium': ['5101210004'],  # 24.5-31.4 microns
    'degreased_coarse': ['5101210006'],  # 31.4-35.4 microns
    'degreased_very_coarse': ['5101210008'],  # > 35.4 microns
    
    # Carded wool
    'carded': ['5105100000'],
    
    # Combed wool / tops
    'combed': ['5105210000'],
    
    # Yarn for carpet (85%+ wool)
    'yarn_carpet': ['5106100101'],
    
    # Other yarns (85%+ wool)
    'yarn_85plus': ['5109100001', '5109100009', '5109100019'],
    
    # Yarns (<85% wool)
    'yarn_less85': ['5109900001', '5109900019'],
}

# All wool HS codes flattened
ALL_WOOL_HS_CODES = [code for codes in WOOL_HS_CODES.values() for code in codes]


def get_available_files():
    """Get list of available export data files"""
    files = []
    
    if not os.path.exists(EXPORT_DATA_DIR):
        return files
    
    for filename in os.listdir(EXPORT_DATA_DIR):
        if filename.endswith('.csv') and 'Exports_HS10_by_Country' in filename:
            filepath = os.path.join(EXPORT_DATA_DIR, filename)
            file_size = os.path.getsize(filepath)
            
            # Determine if it's monthly or yearly
            if filename.startswith(('Jan_', 'Feb_', 'Mar_', 'Apr_', 'May_', 'Jun_', 
                                   'Jul_', 'Aug_', 'Sep_', 'Oct_', 'Nov_', 'Dec_')):
                file_type = 'monthly'
                # Extract year and month from filename
                parts = filename.split('_')
                month_name = parts[0]
                year = parts[1]
                # Convert to YYYYMM format
                month_map = {
                    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
                }
                date_key = f"{year}{month_map[month_name]}"
            else:
                file_type = 'yearly'
                # Extract year from filename
                year = filename.split('_')[0]
                date_key = year
            
            files.append({
                'filename': filename,
                'filepath': filepath,
                'type': file_type,
                'date_key': date_key,
                'size': file_size
            })
    
    # Sort by date (most recent first)
    files.sort(key=lambda x: x['date_key'], reverse=True)
    return files


def load_export_data(filenames=None, wool_only=True, date_range=None, countries=None, wool_categories=None):
    """
    Load export data from specified files
    
    Args:
        filenames: List of filenames to load (None = load all)
        wool_only: If True, filter to wool-related HS codes only
        date_range: Tuple of (start_date, end_date) in YYYYMM format
        countries: List of country names to filter (None = all countries)
        wool_categories: List of wool category keys to filter (None = all wool categories)
    
    Returns:
        DataFrame with export data
    """
    if filenames is None:
        files = get_available_files()
        filenames = [f['filename'] for f in files]
    
    all_data = []
    
    for filename in filenames:
        filepath = os.path.join(EXPORT_DATA_DIR, filename)
        if not os.path.exists(filepath):
            continue
        
        try:
            df = pd.read_csv(filepath, low_memory=False)
            
            # Normalize column names: lowercase and replace spaces with underscores
            df.columns = df.columns.str.lower().str.replace(' ', '_').str.replace('(', '').str.replace(')', '').str.replace('-', '_')
            # Remove $ signs (need to do separately as it's a special regex character)
            df.columns = df.columns.str.replace('_$', '_', regex=False).str.replace('$', '', regex=False)
            
            # Map common column name variations to standard names
            column_mapping = {
                'harmonised_system_code': 'hs',
                'harmonised_system_description': 'hs_desc',
                'unit_qty': 'uom',
                'exports_nzd_fob': 'export_fob',
                'exports_qty': 'export_qty',
                're_exports_nzd_fob': 're_export_fob',
                're_exports_qty': 're_export_qty',
                'total_exports_nzd_fob': 'total_export_fob',
                'total_exports_qty': 'total_export_qty'
            }
            
            # Rename columns if they exist
            df = df.rename(columns=column_mapping)
            
            # Ensure month column is integer type for proper filtering
            if 'month' in df.columns:
                df['month'] = df['month'].astype(int)
            
            # Convert numeric columns to proper types
            # First, convert any string values with commas to numeric strings
            numeric_columns = ['export_fob', 'export_qty', 're_export_fob', 're_export_qty', 
                             'total_export_fob', 'total_export_qty']
            for col in numeric_columns:
                if col in df.columns:
                    # If the column contains strings with commas, remove them first
                    if df[col].dtype == 'object':
                        df[col] = df[col].astype(str).str.replace(',', '', regex=False)
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            
            # Filter to wool codes if requested
            if wool_only:
                if wool_categories:
                    # Filter to specific categories
                    selected_hs_codes = []
                    for category in wool_categories:
                        if category in WOOL_HS_CODES:
                            selected_hs_codes.extend(WOOL_HS_CODES[category])
                    if selected_hs_codes:
                        df = df[df['hs'].astype(str).isin(selected_hs_codes)]
                    else:
                        df = pd.DataFrame()  # No matching categories
                else:
                    # All wool codes
                    df = df[df['hs'].astype(str).isin(ALL_WOOL_HS_CODES)]
            
            # Filter by date range if specified
            if date_range:
                start_date, end_date = date_range
                df = df[(df['month'] >= start_date) & (df['month'] <= end_date)]
            
            # Filter by countries if specified
            if countries:
                df = df[df['country'].isin(countries)]
            
            all_data.append(df)
            
        except Exception as e:
            print(f"Error loading {filename}: {str(e)}")
            continue
    
    if not all_data:
        return pd.DataFrame()
    
    # Combine all dataframes
    combined_df = pd.concat(all_data, ignore_index=True)
    
    return combined_df


def get_wool_category(hs_code):
    """Get wool category for a given HS code"""
    hs_str = str(hs_code)
    
    for category, codes in WOOL_HS_CODES.items():
        if hs_str in codes:
            return category
    
    return 'other'


def categorize_wool_data(df):
    """Add wool category column to dataframe"""
    if df.empty:
        return df
    
    df = df.copy()
    df['wool_category'] = df['hs'].apply(get_wool_category)
    
    # Add processing stage
    def get_processing_stage(category):
        if 'greasy' in category:
            return 'Greasy'
        elif 'degreased' in category:
            return 'Degreased/Scoured'
        elif 'carded' in category:
            return 'Carded'
        elif 'combed' in category:
            return 'Combed/Tops'
        elif 'yarn' in category:
            return 'Yarn'
        return 'Other'
    
    df['processing_stage'] = df['wool_category'].apply(get_processing_stage)
    
    # Add micron range
    def get_micron_range(category):
        if 'fine' in category:
            return '< 24.5'
        elif 'medium' in category:
            return '24.5-31.4'
        elif 'coarse' in category:
            return '31.4-35.4'
        elif 'very_coarse' in category:
            return '> 35.4'
        return 'N/A'
    
    df['micron_range'] = df['wool_category'].apply(get_micron_range)
    
    return df


def get_data_summary(df):
    """Get summary statistics for the loaded data"""
    if df.empty:
        return {
            'total_records': 0,
            'date_range': None,
            'countries': [],
            'total_value': 0,
            'total_quantity': 0,
            'has_provisional': False,
            'provisional_months': []
        }
    
    summary = {
        'total_records': len(df),
        'date_range': {
            'start': int(df['month'].min()),
            'end': int(df['month'].max())
        },
        'countries': sorted(df['country'].unique().tolist()),
        'total_value': float(df['total_export_fob'].sum()),
        'total_quantity': float(df['total_export_qty'].sum()),
        'has_provisional': 'Provisional' in df['status'].values,
        'provisional_months': sorted(df[df['status'] == 'Provisional']['month'].unique().tolist()) if 'Provisional' in df['status'].values else []
    }
    
    return summary


def aggregate_by_category(df, group_by='wool_category'):
    """Aggregate data by wool category or other grouping"""
    if df.empty:
        return pd.DataFrame()
    
    # Only use Total Exports columns (exports + re-exports)
    agg_df = df.groupby(group_by).agg({
        'total_export_fob': 'sum',
        'total_export_qty': 'sum'
    }).reset_index()
    
    return agg_df


def aggregate_by_country(df):
    """Aggregate data by country"""
    if df.empty:
        return pd.DataFrame()
    
    # Only use Total Exports columns (exports + re-exports)
    agg_df = df.groupby('country').agg({
        'total_export_fob': 'sum',
        'total_export_qty': 'sum'
    }).reset_index()
    
    # Sort by total value descending
    agg_df = agg_df.sort_values('total_export_fob', ascending=False)
    
    return agg_df


def aggregate_by_month(df):
    """Aggregate data by month"""
    if df.empty:
        return pd.DataFrame()
    
    # Only use Total Exports columns (exports + re-exports)
    agg_df = df.groupby('month').agg({
        'total_export_fob': 'sum',
        'total_export_qty': 'sum',
        'status': lambda x: x.iloc[0]  # Take first status (should be same for all in month)
    }).reset_index()
    
    # Sort by month
    agg_df = agg_df.sort_values('month')
    
    return agg_df

