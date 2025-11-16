#!/usr/bin/env python3
"""
Auction Data Search GUI
A Flask web app for searching and visualizing auction data
"""

from flask import Flask, render_template, request, jsonify, g, send_file, make_response
from db_connector import get_db_connection
from datetime import datetime, timedelta
import json
import time
import threading
import os
import statistics
import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats as scipy_stats
from io import BytesIO
from export_data_loader import (
    get_available_files, load_export_data, categorize_wool_data,
    get_data_summary, aggregate_by_category, aggregate_by_country, aggregate_by_month
)
try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

app = Flask(__name__)

# Configure log file path (outside git repo to avoid conflicts)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Place log in parent directory (outside git repo)
LOG_FILE = os.path.join(os.path.dirname(BASE_DIR), 'fusca_activity.log')

def log_activity(endpoint, tool_name, data=None, result_count=None, error=None):
    """Log all API activity for analytics"""
    try:
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        log_entry = {
            'timestamp': timestamp,
            'endpoint': endpoint,
            'tool': tool_name,
            'data': data or {},
            'result_count': result_count,
            'error': error
        }
        
        # Ensure directory exists
        log_dir = os.path.dirname(LOG_FILE)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        
        # Write as JSON line for easy parsing (append mode creates file if it doesn't exist)
        with open(LOG_FILE, 'a') as f:
            f.write(json.dumps(log_entry) + '\n')
            
    except Exception as e:
        print(f"Logging error: {str(e)}")

# Lock to prevent simultaneous tunnel creation across workers
_tunnel_lock = threading.Lock()

# Security: Whitelist of allowed columns for filtering
ALLOWED_COLUMNS = {
    'price', 'bales', 'kg', 'colour', 'micron', 'yield', 
    'vegetable_matter', 'sale_date', 'location', 
    'seller_name', 'farm_brand_name', 'wool_type_id',
    'type_combined', 'lot_number', 'is_sold'
}

def derive_length_index(type_combined):
    """
    Derive length_index from type_combined string.
    The last character is the length code (A-Z).
    A=1 (longest), Z=26 (shortest).
    Returns None if invalid.
    """
    if not type_combined or not isinstance(type_combined, str) or len(type_combined) == 0:
        return None
    
    length_code = type_combined[-1].upper()
    if length_code.isalpha():
        return ord(length_code) - ord('A') + 1
    return None

# Per-worker connection storage (each Gunicorn worker process keeps its own connection)
_worker_conn = None
_worker_tunnel = None
_worker_pid = None

def get_db():
    """Get or create database connection per worker process"""
    global _worker_conn, _worker_tunnel, _worker_pid
    import os as os_module
    
    current_pid = os_module.getpid()
    
    # If this is a new worker process, clear old connection
    if _worker_pid != current_pid:
        _worker_conn = None
        _worker_tunnel = None
        _worker_pid = current_pid
        print(f"New worker process {current_pid}, creating new connection...")
    
    # Check if existing connection is still valid
    try:
        if _worker_conn and _worker_conn.is_connected() and _worker_tunnel:
            return _worker_conn, _worker_tunnel
    except:
        pass
    
    # Need new connection
    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"Worker {current_pid}: Connecting to database (attempt {attempt + 1}/{max_retries})...")
            _worker_conn, _worker_tunnel = get_db_connection()
            print(f"Worker {current_pid}: Database connected successfully!")
            return _worker_conn, _worker_tunnel
        except Exception as e:
            print(f"Worker {current_pid}: Connection attempt {attempt + 1} failed: {e}")
            # Clean up failed tunnel
            if _worker_tunnel:
                try:
                    _worker_tunnel.stop()
                except:
                    pass
            _worker_tunnel = None
            _worker_conn = None
            
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                raise
    
    raise Exception("Failed to establish database connection after retries")

@app.route('/')
def index():
    """Redirect to simple search"""
    from flask import redirect
    return redirect('/simple')

@app.route('/simple')
def simple_search():
    """Simple search page"""
    return render_template('simple_search.html', page='simple')

@app.route('/compare')
def compare_types():
    """Compare types page"""
    return render_template('compare_types.html', page='compare')

@app.route('/blends')
def advanced_blends():
    """Advanced blends page"""
    return render_template('advanced_blends.html', page='blends')

@app.route('/metrics')
def advanced_metrics():
    """Advanced metrics page"""
    return render_template('advanced_metrics.html', page='metrics')

# ==================== IFRAME ROUTES ====================

@app.route('/simple-iframe')
def simple_search_iframe():
    """Simple search iframe version (no header/nav)"""
    return render_template('simple_search_iframe.html')

@app.route('/compare-iframe')
def compare_types_iframe():
    """Compare types iframe version (no header/nav)"""
    return render_template('compare_types_iframe.html')

@app.route('/blends-iframe')
def advanced_blends_iframe():
    """Advanced blends iframe version (no header/nav)"""
    return render_template('advanced_blends_iframe.html')

@app.route('/metrics-iframe')
def advanced_metrics_iframe():
    """Advanced metrics iframe version (no header/nav)"""
    return render_template('advanced_metrics_iframe.html')

@app.route('/export-data')
def export_data():
    """Export Data analysis page"""
    return render_template('export_data.html', page='export-data')

@app.route('/export-data-iframe')
def export_data_iframe():
    """Export Data analysis page (iframe version)"""
    return render_template('export_data_iframe.html', page='export-data')

@app.route('/admin')
def admin_dashboard():
    """Admin dashboard for search analytics"""
    return render_template('admin_dashboard.html', page='admin')

@app.route('/api/admin/analytics')
def get_analytics():
    """Get analytics data from log file"""
    try:
        if not os.path.exists(LOG_FILE):
            return jsonify({
                'total_searches': 0,
                'by_tool': {},
                'by_endpoint': {},
                'recent_searches': [],
                'top_searches': [],
                'errors': []
            })
        
        # Read and parse log file
        activities = []
        with open(LOG_FILE, 'r') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        activities.append(json.loads(line))
                    except json.JSONDecodeError:
                        # Skip malformed lines (old format)
                        continue
        
        # Calculate statistics
        total_searches = len(activities)
        
        # Group by tool
        by_tool = {}
        for activity in activities:
            tool = activity.get('tool', 'Unknown')
            by_tool[tool] = by_tool.get(tool, 0) + 1
        
        # Group by endpoint
        by_endpoint = {}
        for activity in activities:
            endpoint = activity.get('endpoint', 'Unknown')
            by_endpoint[endpoint] = by_endpoint.get(endpoint, 0) + 1
        
        # Get recent searches (last 50)
        recent_searches = sorted(activities, key=lambda x: x.get('timestamp', ''), reverse=True)[:50]
        
        # Get top searches by wool type (from data.wool_type)
        wool_type_counts = {}
        for activity in activities:
            data = activity.get('data', {})
            wool_type = data.get('wool_type')
            if wool_type:
                wool_type_counts[wool_type] = wool_type_counts.get(wool_type, 0) + 1
        
        top_searches = sorted(wool_type_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Get errors
        errors = [a for a in activities if a.get('error')]
        
        # Time-based stats (last 24 hours, 7 days, 30 days)
        now = datetime.now()
        last_24h = [a for a in activities if a.get('timestamp') and 
                   (now - datetime.strptime(a['timestamp'], '%Y-%m-%d %H:%M:%S')).total_seconds() < 86400]
        last_7d = [a for a in activities if a.get('timestamp') and 
                  (now - datetime.strptime(a['timestamp'], '%Y-%m-%d %H:%M:%S')).total_seconds() < 604800]
        last_30d = [a for a in activities if a.get('timestamp') and 
                   (now - datetime.strptime(a['timestamp'], '%Y-%m-%d %H:%M:%S')).total_seconds() < 2592000]
        
        return jsonify({
            'total_searches': total_searches,
            'by_tool': by_tool,
            'by_endpoint': by_endpoint,
            'recent_searches': recent_searches[:20],  # Limit to 20 for response size
            'top_searches': [{'wool_type': k, 'count': v} for k, v in top_searches],
            'errors': errors[-20:],  # Last 20 errors
            'time_stats': {
                'last_24h': len(last_24h),
                'last_7d': len(last_7d),
                'last_30d': len(last_30d)
            }
        })
        
    except Exception as e:
        print(f"Analytics error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/raw-logs')
def get_raw_logs():
    """Get raw log file content"""
    try:
        if not os.path.exists(LOG_FILE):
            return jsonify({'logs': '', 'line_count': 0})
        
        # Read last 1000 lines to avoid huge responses
        with open(LOG_FILE, 'r') as f:
            lines = f.readlines()
            # Get last 1000 lines (most recent)
            recent_lines = lines[-1000:] if len(lines) > 1000 else lines
            # Reverse to show most recent at top
            recent_lines.reverse()
            log_content = ''.join(recent_lines)
        
        return jsonify({
            'logs': log_content,
            'line_count': len(lines),
            'showing_lines': len(recent_lines)
        })
        
    except Exception as e:
        print(f"Raw logs error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/clear-logs', methods=['POST'])
def clear_logs():
    """Archive current log file and create a new empty one"""
    try:
        if not os.path.exists(LOG_FILE):
            return jsonify({'status': 'success', 'message': 'No log file to archive'})
        
        # Generate archive filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        log_dir = os.path.dirname(LOG_FILE)
        archive_filename = f"fusca_activity_{timestamp}.log"
        archive_path = os.path.join(log_dir, archive_filename)
        
        # Copy current log to archive
        import shutil
        shutil.copy2(LOG_FILE, archive_path)
        
        # Create new empty log file
        with open(LOG_FILE, 'w') as f:
            f.write('')  # Empty file
        
        return jsonify({
            'status': 'success',
            'message': f'Logs archived to {archive_filename}',
            'archive_file': archive_filename
        })
        
    except Exception as e:
        print(f"Clear logs error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ==================== ADVANCED METRICS API ENDPOINTS ====================

@app.route('/api/metrics/distribution', methods=['POST'])
def get_distribution():
    """
    Get distribution analysis for a specific variable.
    Computes counts, mean, median, std dev, and histogram bins.
    """
    try:
        data = request.get_json()
        variable = data.get('variable', 'micron')  # micron, colour, vegetable_matter, yield
        log_activity('/api/metrics/distribution', 'Advanced Metrics', {
            'variable': variable,
            'date_range': data.get('date_range')
        })
        bin_size = float(data.get('bin_size', 0.5))  # bin width
        filters = data.get('filters', {})
        
        # Build query - with micron floor for distribution analysis
        query = """
            SELECT {variable}, bales, kg, micron
            FROM auction_data_joined
            WHERE price > 0
            AND micron >= 10.0
        """.format(variable=variable if variable in ALLOWED_COLUMNS else 'micron')
        
        params = []
        
        # For colour distribution, exclude micron < 25
        if variable == 'colour':
            query += " AND micron >= 25.0"
        
        # Apply date range filter if provided
        if filters.get('start_date'):
            query += " AND sale_date >= %s"
            params.append(filters['start_date'])
        if filters.get('end_date'):
            query += " AND sale_date <= %s"
            params.append(filters['end_date'])
        
        # Apply additional filters
        for key, value in filters.items():
            if key in ALLOWED_COLUMNS and key not in ['start_date', 'end_date']:
                if isinstance(value, dict) and 'min' in value and 'max' in value:
                    query += f" AND {key} BETWEEN %s AND %s"
                    params.extend([value['min'], value['max']])
        
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        if not results or not isinstance(results, list):
            return jsonify({'error': 'No data found for the specified filters'})
        
        # Extract values and bales for weighting
        data_points = [(row[variable], row['bales']) for row in results if row[variable] is not None and row['bales'] is not None]
        
        if not data_points:
            return jsonify({'error': 'No valid data for the selected variable'})
        
        values = [point[0] for point in data_points]
        
        # Calculate statistics
        mean_val = statistics.mean(values)
        median_val = statistics.median(values)
        std_dev = statistics.stdev(values) if len(values) > 1 else 0
        min_val = min(values)
        max_val = max(values)
        
        # Create histogram bins
        bins = np.arange(min_val, max_val + bin_size, bin_size)
        
        # Calculate kg weight (bales * 120) for each bin
        histogram = []
        for i in range(len(bins) - 1):
            bin_start = bins[i]
            bin_end = bins[i + 1]
            # Sum bales for values in this bin and convert to kg
            bin_bales = sum(point[1] for point in data_points if bin_start <= point[0] < bin_end)
            bin_kg = bin_bales * 120
            
            histogram.append({
                'bin_start': round(float(bin_start), 2),
                'bin_end': round(float(bin_end), 2),
                'kg': round(float(bin_kg), 0)
            })
        
        return jsonify({
            'variable': variable,
            'statistics': {
                'mean': round(mean_val, 2),
                'median': round(median_val, 2),
                'std_dev': round(std_dev, 2),
                'min': round(min_val, 2),
                'max': round(max_val, 2),
                'count': len(values)
            },
            'histogram': histogram
        })
    
    except Exception as e:
        print(f"Distribution error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/metrics/timeseries', methods=['POST'])
def get_timeseries():
    """
    Get time series analysis for selected variables.
    Aggregates to weekly or monthly averages.
    """
    try:
        data = request.get_json()
        variables = data.get('variables', ['micron', 'colour', 'vegetable_matter'])
        aggregation = data.get('aggregation', 'monthly')  # weekly or monthly
        filters = data.get('filters', {})
        log_activity('/api/metrics/timeseries', 'Advanced Metrics', {
            'variables': variables,
            'aggregation': aggregation
        })
        
        # Validate variables
        variables = [v for v in variables if v in ALLOWED_COLUMNS]
        if not variables:
            variables = ['micron']
        
        # Build query to fetch all data
        query = """
            SELECT sale_date, price, bales, kg, micron, colour, vegetable_matter, yield, type_combined
            FROM auction_data_joined
            WHERE price > 0
            AND vegetable_matter BETWEEN 0 AND 1.0
            AND yield <= 92
            AND kg >= 50
        """
        
        params = []
        
        # Apply micron filter (user-defined or defaults)
        min_micron = filters.get('min_micron', 30)
        max_micron = filters.get('max_micron', 42)
        query += " AND micron BETWEEN %s AND %s"
        params.extend([min_micron, max_micron])
        
        # Apply date range filter
        if filters.get('start_date'):
            query += " AND sale_date >= %s"
            params.append(filters['start_date'])
        else:
            # Default to 2012-07-01
            query += " AND sale_date >= %s"
            params.append('2012-07-01')
        
        if filters.get('end_date'):
            query += " AND sale_date <= %s"
            params.append(filters['end_date'])
        
        query += " ORDER BY sale_date"
        
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        if not results:
            return jsonify({'error': 'No data found'})
        if not isinstance(results, list):
            return jsonify({'error': 'Invalid data format'})
        if len(results) == 0:
            return jsonify({'error': 'No data found'})
        
        # Convert to pandas DataFrame
        df = pd.DataFrame(results)
        df['sale_date'] = pd.to_datetime(df['sale_date'])
        
        # Add length_index
        df['length_index'] = df['type_combined'].apply(derive_length_index)
        
        # Set aggregation period
        if aggregation == 'weekly':
            df['period'] = df['sale_date'].dt.to_period('W')
        else:
            df['period'] = df['sale_date'].dt.to_period('M')
        
        # Group and aggregate
        grouped = df.groupby('period')
        
        series_data = {}
        for var in variables:
            if var in df.columns:
                series_data[var] = grouped[var].mean().to_dict()
        
        # Format for JSON
        formatted_series = {}
        for var, data_dict in series_data.items():
            labels = []
            values = []
            for period, value in data_dict.items():
                try:
                    labels.append(str(period))
                    values.append(round(float(value), 2) if not pd.isna(value) else None)
                except Exception as e:
                    print(f"Warning: Skipping period {period}: {e}")
                    continue
            formatted_series[var] = {
                'labels': labels,
                'values': values
            }
        
        return jsonify({
            'aggregation': aggregation,
            'series': formatted_series
        })
    
    except Exception as e:
        import traceback
        print(f"Timeseries error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/metrics/regression', methods=['POST'])
def get_regression():
    """
    Perform OLS regression analysis on a weekly basis.
    Returns coefficients, R², and fitted values over time.
    """
    try:
        data = request.get_json()
        filters = data.get('filters', {})
        smooth_window = int(data.get('smooth_window', 5))  # weeks to smooth coefficients
        log_activity('/api/metrics/regression', 'Advanced Metrics', {
            'smooth_window': smooth_window
        })
        
        # Build query
        query = """
            SELECT sale_date, price, bales, kg, micron, colour, vegetable_matter, yield, type_combined
            FROM auction_data_joined
            WHERE price > 0
            AND vegetable_matter BETWEEN 0 AND 1.0
            AND yield <= 92
            AND kg >= 50
        """
        
        params = []
        
        # Apply micron filter (user-defined or defaults)
        min_micron = filters.get('min_micron', 30)
        max_micron = filters.get('max_micron', 42)
        query += " AND micron BETWEEN %s AND %s"
        params.extend([min_micron, max_micron])
        
        # Apply date range filter
        if filters.get('start_date'):
            query += " AND sale_date >= %s"
            params.append(filters['start_date'])
        else:
            query += " AND sale_date >= %s"
            params.append('2012-07-01')
        
        if filters.get('end_date'):
            query += " AND sale_date <= %s"
            params.append(filters['end_date'])
        
        query += " ORDER BY sale_date"
        
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        if not results:
            return jsonify({'error': 'No data found'})
        if not isinstance(results, list):
            return jsonify({'error': 'Invalid data format'})
        if len(results) == 0:
            return jsonify({'error': 'No data found'})
        
        # Convert to pandas DataFrame
        df = pd.DataFrame(results)
        df['sale_date'] = pd.to_datetime(df['sale_date'])
        df['length_index'] = df['type_combined'].apply(derive_length_index)
        df['week'] = df['sale_date'].dt.to_period('W')
        
        # Run weekly regressions
        weekly_results = []
        
        for week, week_df in df.groupby('week'):
            if len(week_df) < 20:  # Need minimum data points
                continue
            
            # Prepare regression data
            y = week_df['price'].values
            X = week_df[['micron', 'colour', 'length_index', 'vegetable_matter']].copy()
            
            # Scale VM by 10 so 1 unit = 0.1 change (makes regression less volatile)
            X['vegetable_matter'] = X['vegetable_matter'] * 10
            
            # Drop rows with missing values
            valid_mask = ~(X.isna().any(axis=1) | pd.isna(y))
            y_clean = y[valid_mask]
            X_clean = X[valid_mask]
            
            if len(y_clean) < 20:
                continue
            
            # Add constant term
            X_clean = sm.add_constant(X_clean)
            
            try:
                # Fit OLS model
                model = sm.OLS(y_clean, X_clean).fit()
                
                # Skip weeks where r^2 < 0.4
                if float(model.rsquared) < 0.4:
                    continue
                
                weekly_results.append({
                    'week': str(week),
                    'r_squared': round(float(model.rsquared), 4),
                    'adj_r_squared': round(float(model.rsquared_adj), 4),
                    'coefficients': {
                        'intercept': round(float(model.params['const']), 2),
                        'micron': round(float(model.params['micron']), 2),
                        'colour': round(float(model.params['colour']), 2),
                        'length_index': round(float(model.params['length_index']), 2),
                        'vegetable_matter': round(float(model.params['vegetable_matter']), 2)
                    },
                    'n_obs': int(model.nobs)
                })
            except Exception as e:
                print(f"Regression failed for week {week}: {e}")
                continue
        
        if not weekly_results:
            return jsonify({'error': 'Insufficient data for regression analysis'})
        
        # Apply smoothing if requested
        if smooth_window > 1:
            df_results = pd.DataFrame(weekly_results)
            for coef in ['micron', 'colour', 'length_index', 'vegetable_matter']:
                coef_series = df_results['coefficients'].apply(lambda x: x[coef])
                smoothed = coef_series.rolling(window=smooth_window, min_periods=1).mean()
                for i, val in enumerate(smoothed):
                    weekly_results[i]['coefficients'][f'{coef}_smoothed'] = round(float(val), 2)
        
        return jsonify({
            'weekly_results': weekly_results,
            'summary': {
                'weeks_analyzed': len(weekly_results),  # Note: using American spelling in data key for consistency
                'avg_r_squared': round(float(np.mean([r['adj_r_squared'] for r in weekly_results])), 4)
            }
        })
    
    except Exception as e:
        print(f"Regression error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/metrics/scenario', methods=['POST'])
def get_scenario():
    """
    What-if scenario analysis using recent regression coefficients.
    Estimates price impact of changing wool characteristics.
    """
    try:
        data = request.get_json()
        baseline = data.get('baseline', {})  # baseline characteristics
        scenario = data.get('scenario', {})  # changed characteristics
        log_activity('/api/metrics/scenario', 'Advanced Metrics', {
            'has_baseline': bool(baseline),
            'has_scenario': bool(scenario)
        })
        
        # Get most recent regression coefficients - STRONG WOOL ONLY
        query = """
            SELECT sale_date, price, bales, kg, micron, colour, vegetable_matter, yield, type_combined
            FROM auction_data_joined
            WHERE price > 0
            AND micron BETWEEN 28 AND 45
            AND vegetable_matter BETWEEN 0 AND 1.0
            AND yield <= 92
            AND kg >= 50
            AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            ORDER BY sale_date
        """
        
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query)
        results = cursor.fetchall()
        
        if not results:
            return jsonify({'error': 'Insufficient recent data for scenario analysis'})
        if not isinstance(results, list):
            return jsonify({'error': 'Invalid data format'})
        if len(results) < 50:
            return jsonify({'error': 'Insufficient recent data for scenario analysis'})
        
        # Convert to DataFrame and fit regression
        df = pd.DataFrame(results)
        df['sale_date'] = pd.to_datetime(df['sale_date'])
        df['length_index'] = df['type_combined'].apply(derive_length_index)
        
        y = df['price'].values
        X = df[['micron', 'colour', 'length_index', 'vegetable_matter']].copy()
        
        # Scale VM by 10 so 1 unit = 0.1 change (makes regression less volatile)
        X['vegetable_matter'] = X['vegetable_matter'] * 10
        
        # Drop rows with missing values
        valid_mask = ~(X.isna().any(axis=1) | pd.isna(y))
        y_clean = y[valid_mask]
        X_clean = X[valid_mask]
        
        X_clean = sm.add_constant(X_clean)
        model = sm.OLS(y_clean, X_clean).fit()
        
        # Calculate impact
        baseline_vals = {
            'micron': baseline.get('micron', 36),
            'colour': baseline.get('colour', 3.0),
            'length_index': baseline.get('length_index', 4),
            'vegetable_matter': baseline.get('vegetable_matter', 0.3)
        }
        
        scenario_vals = {
            'micron': scenario.get('micron', baseline_vals['micron']),
            'colour': scenario.get('colour', baseline_vals['colour']),
            'length_index': scenario.get('length_index', baseline_vals['length_index']),
            'vegetable_matter': scenario.get('vegetable_matter', baseline_vals['vegetable_matter'])
        }
        
        # Calculate prices (scale VM by 10 for regression coefficient)
        baseline_price = (
            model.params['const'] +
            model.params['micron'] * baseline_vals['micron'] +
            model.params['colour'] * baseline_vals['colour'] +
            model.params['length_index'] * baseline_vals['length_index'] +
            model.params['vegetable_matter'] * (baseline_vals['vegetable_matter'] * 10)
        )
        
        scenario_price = (
            model.params['const'] +
            model.params['micron'] * scenario_vals['micron'] +
            model.params['colour'] * scenario_vals['colour'] +
            model.params['length_index'] * scenario_vals['length_index'] +
            model.params['vegetable_matter'] * (scenario_vals['vegetable_matter'] * 10)
        )
        
        price_change = scenario_price - baseline_price
        
        # Break down impact by factor (scale VM difference by 10 for regression coefficient)
        impact_breakdown = {
            'micron': round(float(model.params['micron'] * (scenario_vals['micron'] - baseline_vals['micron'])), 2),
            'colour': round(float(model.params['colour'] * (scenario_vals['colour'] - baseline_vals['colour'])), 2),
            'length_index': round(float(model.params['length_index'] * (scenario_vals['length_index'] - baseline_vals['length_index'])), 2),
            'vegetable_matter': round(float(model.params['vegetable_matter'] * (scenario_vals['vegetable_matter'] - baseline_vals['vegetable_matter']) * 10), 2)
        }
        
        return jsonify({
            'baseline': baseline_vals,
            'scenario': scenario_vals,
            'baseline_price_cents': round(float(baseline_price), 2),
            'scenario_price_cents': round(float(scenario_price), 2),
            'price_change_cents': round(float(price_change), 2),
            'price_change_dollars': round(float(price_change / 100), 2),
            'impact_breakdown': impact_breakdown,
            'model_stats': {
                'r_squared': round(float(model.rsquared_adj), 4),
                'n_obs': int(model.nobs)
            }
        })
    
    except Exception as e:
        print(f"Scenario error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/metrics/benchmark', methods=['POST'])
def get_benchmark():
    """
    Benchmark a specific lot against national averages and percentiles.
    """
    try:
        data = request.get_json()
        lot_specs = data.get('specs', {})
        time_period = data.get('time_period', 'recent')  # recent, year, all
        log_activity('/api/metrics/benchmark', 'Advanced Metrics', {
            'time_period': time_period,
            'has_specs': bool(lot_specs)
        })
        
        # Build query based on time period
        query = """
            SELECT price, micron, colour, vegetable_matter, yield, type_combined, bales, kg
            FROM auction_data_joined
            WHERE price > 0
            AND micron BETWEEN 30 AND 42
            AND vegetable_matter BETWEEN 0 AND 1.0
            AND yield <= 92
            AND kg >= 50
        """
        
        params = []
        
        if time_period == 'recent':
            query += " AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)"
        elif time_period == 'year':
            query += " AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)"
        elif time_period == 'custom' and data.get('start_date'):
            query += " AND sale_date >= %s"
            params.append(data['start_date'])
            if data.get('end_date'):
                query += " AND sale_date <= %s"
                params.append(data['end_date'])
        
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        if not results:
            return jsonify({'error': 'Insufficient data for benchmarking'})
        if not isinstance(results, list):
            return jsonify({'error': 'Invalid data format'})
        if len(results) < 50:
            return jsonify({'error': 'Insufficient data for benchmarking'})
        
        # Convert to DataFrame
        df = pd.DataFrame(results)
        df['length_index'] = df['type_combined'].apply(derive_length_index)
        
        # Calculate national statistics
        national_stats = {
            'price': {
                'mean': round(float(df['price'].mean()), 2),
                'median': round(float(df['price'].median()), 2),
                'p25': round(float(df['price'].quantile(0.25)), 2),
                'p75': round(float(df['price'].quantile(0.75)), 2),
                'std': round(float(df['price'].std()), 2)
            },
            'micron': {
                'mean': round(float(df['micron'].mean()), 2),
                'median': round(float(df['micron'].median()), 2)
            },
            'colour': {
                'mean': round(float(df['colour'].mean()), 2),
                'median': round(float(df['colour'].median()), 2)
            },
            'vegetable_matter': {
                'mean': round(float(df['vegetable_matter'].mean()), 2),
                'median': round(float(df['vegetable_matter'].median()), 2)
            }
        }
        
        # If lot specs provided, calculate percentile ranking
        lot_ranking = {}
        if lot_specs:
            if 'micron' in lot_specs:
                lot_ranking['micron_percentile'] = round(float(scipy_stats.percentileofscore(df['micron'].dropna(), lot_specs['micron'])), 1)
            if 'colour' in lot_specs:
                # Lower is better, so invert
                lot_ranking['colour_percentile'] = round(100 - float(scipy_stats.percentileofscore(df['colour'].dropna(), lot_specs['colour'])), 1)
            if 'vegetable_matter' in lot_specs:
                # Lower is better
                lot_ranking['vm_percentile'] = round(100 - float(scipy_stats.percentileofscore(df['vegetable_matter'].dropna(), lot_specs['vegetable_matter'])), 1)
            if 'length' in lot_specs:
                # Convert letter to index if needed
                length_val = lot_specs['length']
                if isinstance(length_val, str):
                    length_val = ord(length_val.upper()) - ord('A') + 1
                # Lower index is better (longer staple), so invert
                lot_ranking['length_percentile'] = round(100 - float(scipy_stats.percentileofscore(df['length_index'].dropna(), length_val)), 1)
        
        return jsonify({
            'time_period': time_period,
            'national_stats': national_stats,
            'lot_specs': lot_specs,
            'lot_ranking': lot_ranking,
            'n_lots': len(df)
        })
    
    except Exception as e:
        print(f"Benchmark error: {e}")
        return jsonify({'error': str(e)}), 500

# ==================== END ADVANCED METRICS ENDPOINTS ====================

@app.route('/api/log_saved_search', methods=['POST'])
def log_saved_search():
    """Log saved search activity"""
    try:
        data = request.json
        log_activity('/api/log_saved_search', 'Saved Search', {
            'name': data.get('name', 'Unnamed'),
            'type': data.get('type', 'search'),
            'filters': data.get('filters', {})
        })
        return jsonify({'status': 'logged'})
        
    except Exception as e:
        print(f"Log error: {str(e)}")
        return jsonify({'status': 'error'}), 500

@app.route('/api/filters')
def get_filters():
    """Get min/max values for all filter fields"""
    try:
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        
        # Get min/max for all filterable fields
        cursor.execute("""
            SELECT 
                MIN(colour) as min_colour, MAX(colour) as max_colour,
                MIN(micron) as min_micron, MAX(micron) as max_micron,
                MIN(yield) as min_yield, MAX(yield) as max_yield,
                MIN(vegetable_matter) as min_vm, MAX(vegetable_matter) as max_vm,
                MIN(price) as min_price, MAX(price) as max_price
            FROM auction_data_joined
            WHERE price > 10
        """)
        
        ranges = cursor.fetchone()
        
        return jsonify({
            'ranges': ranges
        })
        
    except Exception as e:
        print(f"Error in get_filters: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/search', methods=['POST'])
def search_auctions():
    """Search auctions with filters"""
    try:
        data = request.json
        # Store initial data for logging (will be updated with result_count later)
        log_data = {
            'wool_type': data.get('wool_type_search'),
            'filter_count': len(data.get('column_filters', []))
        }
        
        # Build query with filters
        query = """
            SELECT 
                id, lot_number, sale_date, bales, kg, price, 
                colour, micron, yield, vegetable_matter,
                wool_type_id, type_combined, location, is_sold,
                seller_name, farm_brand_name
            FROM auction_data_joined
            WHERE price > 10
        """
        
        params = []
        
        # Wool type filter - search by text input
        if data.get('wool_type_search'):
            search_term = data['wool_type_search'].strip()
            if search_term:
                query += " AND (CAST(wool_type_id AS CHAR) = %s OR type_combined = %s)"
                params.append(search_term)
                params.append(search_term)
        
        # Apply column filters
        if data.get('column_filters'):
            for filter_item in data['column_filters']:
                column = filter_item.get('column')
                operator = filter_item.get('operator')
                value = filter_item.get('value')
                value2 = filter_item.get('value2')
                
                if not column or not operator or not value:
                    continue
                
                # Security: Validate column name against whitelist
                if column not in ALLOWED_COLUMNS:
                    print(f"Warning: Invalid column name attempted: {column}")
                    continue
                
                # Build filter condition based on operator
                if operator == 'eq':
                    query += f" AND {column} = %s"
                    params.append(value)
                elif operator == 'ne':
                    query += f" AND {column} != %s"
                    params.append(value)
                elif operator == 'gt':
                    query += f" AND {column} > %s"
                    params.append(value)
                elif operator == 'lt':
                    query += f" AND {column} < %s"
                    params.append(value)
                elif operator == 'gte':
                    query += f" AND {column} >= %s"
                    params.append(value)
                elif operator == 'lte':
                    query += f" AND {column} <= %s"
                    params.append(value)
                elif operator == 'between' and value2:
                    query += f" AND {column} BETWEEN %s AND %s"
                    params.append(value)
                    params.append(value2)
                elif operator == 'contains':
                    query += f" AND {column} LIKE %s"
                    params.append(f"%{value}%")
                elif operator == 'not_contains':
                    query += f" AND {column} NOT LIKE %s"
                    params.append(f"%{value}%")
        
        # Order by date
        query += " ORDER BY sale_date DESC LIMIT 1000"
        
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Convert date objects to strings
        for row in results:
            if row['sale_date']:
                row['sale_date'] = row['sale_date'].strftime('%Y-%m-%d')
        
        result_count = len(results)
        # Log once with all data including result count
        log_activity('/api/search', 'Simple Search', data=log_data, result_count=result_count)
        
        return jsonify({
            'count': result_count,
            'results': results
        })
        
    except Exception as e:
        print(f"Search error: {str(e)}")
        import traceback
        traceback.print_exc()
        # Log error with the request data if available
        log_activity('/api/search', 'Simple Search', data=log_data if 'log_data' in locals() else {}, error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/bales_chart', methods=['POST'])
def get_bales_chart():
    """Get bales data grouped by sale_date for chart"""
    try:
        data = request.json
        log_activity('/api/bales_chart', 'Simple Search', {
            'wool_type': data.get('wool_type_search'),
            'filter_count': len(data.get('column_filters', []))
        })
        
        # Build query with filters - get bales grouped by date
        query = """
            SELECT 
                sale_date,
                SUM(bales) as total_bales
            FROM auction_data_joined
            WHERE price > 10
        """
        
        params = []
        
        # Apply same filters as search - wool type search
        if data.get('wool_type_search'):
            search_term = data['wool_type_search'].strip()
            if search_term:
                query += " AND (CAST(wool_type_id AS CHAR) = %s OR type_combined = %s)"
                params.append(search_term)
                params.append(search_term)
        
        # Apply column filters (same as search endpoint)
        if data.get('column_filters'):
            for filter_item in data['column_filters']:
                column = filter_item.get('column')
                operator = filter_item.get('operator')
                value = filter_item.get('value')
                value2 = filter_item.get('value2')
                
                if not column or not operator or not value:
                    continue
                
                # Security: Validate column name against whitelist
                if column not in ALLOWED_COLUMNS:
                    print(f"Warning: Invalid column name attempted: {column}")
                    continue
                
                # Build filter condition based on operator
                if operator == 'eq':
                    query += f" AND {column} = %s"
                    params.append(value)
                elif operator == 'ne':
                    query += f" AND {column} != %s"
                    params.append(value)
                elif operator == 'gt':
                    query += f" AND {column} > %s"
                    params.append(value)
                elif operator == 'lt':
                    query += f" AND {column} < %s"
                    params.append(value)
                elif operator == 'gte':
                    query += f" AND {column} >= %s"
                    params.append(value)
                elif operator == 'lte':
                    query += f" AND {column} <= %s"
                    params.append(value)
                elif operator == 'between' and value2:
                    query += f" AND {column} BETWEEN %s AND %s"
                    params.append(value)
                    params.append(value2)
                elif operator == 'contains':
                    query += f" AND {column} LIKE %s"
                    params.append(f"%{value}%")
                elif operator == 'not_contains':
                    query += f" AND {column} NOT LIKE %s"
                    params.append(f"%{value}%")
        
        # Group by sale_date
        query += " GROUP BY sale_date ORDER BY sale_date ASC"
        
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Format data for chart
        labels = []
        bales_data = []
        
        for row in results:
            if row['sale_date'] and row['total_bales']:
                labels.append(row['sale_date'].strftime('%Y-%m-%d'))
                bales_data.append(int(row['total_bales']))
        
        return jsonify({
            'labels': labels,
            'data': bales_data
        })
        
    except Exception as e:
        print(f"Bales chart error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def interpolate_series(values):
    """Apply linear interpolation to fill missing data points"""
    interpolated = values[:]
    
    for i in range(len(interpolated)):
        if interpolated[i] is None:
            # Find previous valid point
            prev_idx = i - 1
            while prev_idx >= 0 and interpolated[prev_idx] is None:
                prev_idx -= 1
            
            # Find next valid point
            next_idx = i + 1
            while next_idx < len(interpolated) and interpolated[next_idx] is None:
                next_idx += 1
            
            # Interpolate if we have both prev and next
            if prev_idx >= 0 and next_idx < len(interpolated):
                prev_value = interpolated[prev_idx]
                next_value = interpolated[next_idx]
                distance = next_idx - prev_idx
                position = i - prev_idx
                
                # Linear interpolation
                interpolated[i] = prev_value + (next_value - prev_value) * (position / distance)
            # If only prev exists, use prev (flat line forward)
            elif prev_idx >= 0:
                interpolated[i] = interpolated[prev_idx]
            # If only next exists, use next (flat line backward)
            elif next_idx < len(interpolated):
                interpolated[i] = interpolated[next_idx]
    
    return interpolated

@app.route('/api/compare_chart_blend', methods=['POST'])
def get_compare_chart_blend():
    """Get price comparison data with per-entry filters for blend mode (supports grouped types)"""
    try:
        data = request.json
        entries = data.get('entries', [])
        date_filter = data.get('date_filter')
        log_activity('/api/compare_chart_blend', 'Advanced Blends', {
            'entry_count': len(entries),
            'has_date_filter': bool(date_filter)
        })
        
        if not entries or len(entries) == 0:
            return jsonify({'error': 'No entries specified'}), 400
        
        if len(entries) > 5:
            return jsonify({'error': 'Maximum 5 entries for comparison'}), 400
        
        from collections import defaultdict
        import statistics
        
        all_series = {}
        
        for entry in entries:
            types = entry.get('types', [])
            label = entry.get('label', '')
            entry_filters = entry.get('filters', [])
            
            if not types:
                continue
            
            # Process each type in the group individually
            type_series = []  # Will store series data for each type in this group
            
            for wool_type in types:
                # Build query for this wool type
                query = """
                    SELECT 
                        sale_date,
                        price,
                        bales
                    FROM auction_data_joined
                    WHERE price > 10 AND bales > 0
                    AND (CAST(wool_type_id AS CHAR) = %s OR type_combined = %s)
                """
                
                params = [wool_type, wool_type]
            
                # Apply date filter (shared across all entries)
                if date_filter:
                    column = 'sale_date'
                    operator = date_filter.get('operator')
                    value = date_filter.get('value')
                    value2 = date_filter.get('value2')
                    
                    if operator == 'eq':
                        query += f" AND {column} = %s"
                        params.append(value)
                    elif operator == 'gt':
                        query += f" AND {column} > %s"
                        params.append(value)
                    elif operator == 'lt':
                        query += f" AND {column} < %s"
                        params.append(value)
                    elif operator == 'gte':
                        query += f" AND {column} >= %s"
                        params.append(value)
                    elif operator == 'lte':
                        query += f" AND {column} <= %s"
                        params.append(value)
                    elif operator == 'between' and value2:
                        query += f" AND {column} BETWEEN %s AND %s"
                        params.append(value)
                        params.append(value2)
                
                # Apply per-entry filters
                for filter_item in entry_filters:
                    column = filter_item.get('column')
                    operator = filter_item.get('operator')
                    value = filter_item.get('value')
                    value2 = filter_item.get('value2')
                    
                    if not column or not operator or not value:
                        continue
                    
                    if column not in ALLOWED_COLUMNS:
                        continue
                    
                    if operator == 'eq':
                        query += f" AND {column} = %s"
                        params.append(value)
                    elif operator == 'ne':
                        query += f" AND {column} != %s"
                        params.append(value)
                    elif operator == 'gt':
                        query += f" AND {column} > %s"
                        params.append(value)
                    elif operator == 'lt':
                        query += f" AND {column} < %s"
                        params.append(value)
                    elif operator == 'gte':
                        query += f" AND {column} >= %s"
                        params.append(value)
                    elif operator == 'lte':
                        query += f" AND {column} <= %s"
                        params.append(value)
                    elif operator == 'between' and value2:
                        query += f" AND {column} BETWEEN %s AND %s"
                        params.append(value)
                        params.append(value2)
                
                query += " ORDER BY sale_date ASC"
                
                conn, tunnel = get_db()
                cursor = conn.cursor(dictionary=True)
                cursor.execute(query, params)
                results = cursor.fetchall()
                
                # Group by date for THIS specific type - store (price, bales)
                type_date_data = defaultdict(list)
                for row in results:
                    if row['sale_date'] and row['price'] and row['bales']:
                        type_date_data[row['sale_date']].append({
                            'price': float(row['price']),
                            'bales': float(row['bales'])
                        })
                
                # Calculate volume-weighted filtered averages for THIS type
                type_data = {}
                for sale_date in sorted(type_date_data.keys()):
                    items = type_date_data[sale_date]
                    
                    if len(items) == 0:
                        continue
                    
                    # Calculate median price for outlier filtering
                    price_list = [item['price'] for item in items]
                    median_price = statistics.median(price_list)
                    
                    # Filter outliers: remove items where price is +/- 20% from median
                    if len(items) > 1:
                        lower_bound = median_price * 0.8
                        upper_bound = median_price * 1.2
                        filtered_items = [item for item in items if lower_bound <= item['price'] <= upper_bound]
                        
                        if len(filtered_items) == 0:
                            filtered_items = items
                    else:
                        filtered_items = items
                    
                    # Calculate volume-weighted average: sum(price * bales) / sum(bales)
                    total_weighted_price = sum(item['price'] * item['bales'] for item in filtered_items)
                    total_bales = sum(item['bales'] for item in filtered_items)
                    
                    if total_bales > 0:
                        weighted_avg_price = total_weighted_price / total_bales
                        weighted_avg_price_dollars = weighted_avg_price / 100
                        date_key = sale_date.strftime('%Y-%m-%d')
                        type_data[date_key] = weighted_avg_price_dollars
                
                type_series.append(type_data)
            
            # Get all unique dates across all types in this group
            group_dates = sorted(set(date for series in type_series for date in series.keys()))
            
            # Interpolate each type's series to fill missing dates
            interpolated_series = []
            for type_data in type_series:
                # Create array with None for missing dates
                values = [type_data.get(date, None) for date in group_dates]
                # Apply linear interpolation
                interpolated = interpolate_series(values)
                interpolated_series.append(interpolated)
            
            # Now average the interpolated series together
            series_data = {}
            for idx, date in enumerate(group_dates):
                valid_values = [series[idx] for series in interpolated_series if series[idx] is not None]
                if len(valid_values) > 0:
                    avg_value = sum(valid_values) / len(valid_values)
                    series_data[date] = round(avg_value, 2)
            
            all_series[label] = series_data
        
        # Get all unique dates across all series
        all_dates = sorted(set(date for series in all_series.values() for date in series.keys()))
        
        # Build datasets for Chart.js (one per entry/label)
        datasets = []
        colors = ['#3D7F4B', '#1976D2', '#D32F2F', '#F57C00', '#7B1FA2']
        
        for idx, entry_label in enumerate(all_series.keys()):
            series_data = all_series.get(entry_label, {})
            data_values = [series_data.get(date, None) for date in all_dates]
            
            datasets.append({
                'label': entry_label,
                'data': data_values,
                'borderColor': colors[idx % len(colors)],
                'backgroundColor': colors[idx % len(colors)] + '20',
                'borderWidth': 2,
                'tension': 0.1,
                'fill': False,
                'spanGaps': True
            })
        
        return jsonify({
            'labels': all_dates,
            'datasets': datasets
        })
        
    except Exception as e:
        print(f"Blend compare chart error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/compare_chart', methods=['POST'])
def get_compare_chart():
    """Get price comparison data for multiple wool types"""
    try:
        data = request.json
        wool_types = data.get('wool_types', [])
        log_activity('/api/compare_chart', 'Compare Types', {
            'wool_type_count': len(wool_types),
            'wool_types': wool_types[:5]  # Log first 5 to avoid huge logs
        })
        
        if not wool_types or len(wool_types) == 0:
            return jsonify({'error': 'No wool types specified'}), 400
        
        if len(wool_types) > 5:
            return jsonify({'error': 'Maximum 5 wool types for comparison'}), 400
        
        all_series = {}
        
        for wool_type in wool_types:
            # Build query for this wool type
            query = """
                SELECT 
                    sale_date,
                    price,
                    bales
                FROM auction_data_joined
                WHERE price > 10 AND bales > 0
                AND (CAST(wool_type_id AS CHAR) = %s OR type_combined = %s)
            """
            
            params = [wool_type, wool_type]
            
            # Apply additional column filters if provided
            if data.get('column_filters'):
                for filter_item in data['column_filters']:
                    column = filter_item.get('column')
                    operator = filter_item.get('operator')
                    value = filter_item.get('value')
                    value2 = filter_item.get('value2')
                    
                    if not column or not operator or not value:
                        continue
                    
                    if column not in ALLOWED_COLUMNS:
                        continue
                    
                    if operator == 'eq':
                        query += f" AND {column} = %s"
                        params.append(value)
                    elif operator == 'ne':
                        query += f" AND {column} != %s"
                        params.append(value)
                    elif operator == 'gt':
                        query += f" AND {column} > %s"
                        params.append(value)
                    elif operator == 'lt':
                        query += f" AND {column} < %s"
                        params.append(value)
                    elif operator == 'gte':
                        query += f" AND {column} >= %s"
                        params.append(value)
                    elif operator == 'lte':
                        query += f" AND {column} <= %s"
                        params.append(value)
                    elif operator == 'between' and value2:
                        query += f" AND {column} BETWEEN %s AND %s"
                        params.append(value)
                        params.append(value2)
            
            query += " ORDER BY sale_date ASC"
            
            conn, tunnel = get_db()
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, params)
            results = cursor.fetchall()
            
            # Group by date - store (price, bales) for volume-weighted averaging
            from collections import defaultdict
            import statistics
            
            date_data = defaultdict(list)
            for row in results:
                if row['sale_date'] and row['price'] and row['bales']:
                    date_data[row['sale_date']].append({
                        'price': float(row['price']),
                        'bales': float(row['bales'])
                    })
            
            # Calculate volume-weighted filtered averages
            series_data = {}
            for sale_date in sorted(date_data.keys()):
                items = date_data[sale_date]
                
                if len(items) == 0:
                    continue
                
                # Calculate median price for outlier filtering
                price_list = [item['price'] for item in items]
                median_price = statistics.median(price_list)
                
                # Filter outliers: remove items where price is +/- 20% from median
                if len(items) > 1:
                    lower_bound = median_price * 0.8
                    upper_bound = median_price * 1.2
                    filtered_items = [item for item in items if lower_bound <= item['price'] <= upper_bound]
                    
                    if len(filtered_items) == 0:
                        filtered_items = items
                else:
                    filtered_items = items
                
                # Calculate volume-weighted average: sum(price * bales) / sum(bales)
                total_weighted_price = sum(item['price'] * item['bales'] for item in filtered_items)
                total_bales = sum(item['bales'] for item in filtered_items)
                
                if total_bales > 0:
                    weighted_avg_price = total_weighted_price / total_bales
                    weighted_avg_price_dollars = weighted_avg_price / 100
                    date_key = sale_date.strftime('%Y-%m-%d')
                    series_data[date_key] = round(weighted_avg_price_dollars, 2)
            
            all_series[wool_type] = series_data
        
        # Get all unique dates across all series
        all_dates = sorted(set(date for series in all_series.values() for date in series.keys()))
        
        # Build datasets for Chart.js
        datasets = []
        colors = ['#3D7F4B', '#1976D2', '#D32F2F', '#F57C00', '#7B1FA2']
        
        for idx, wool_type in enumerate(wool_types):
            series_data = all_series.get(wool_type, {})
            data_values = [series_data.get(date, None) for date in all_dates]
            
            datasets.append({
                'label': wool_type,
                'data': data_values,
                'borderColor': colors[idx % len(colors)],
                'backgroundColor': colors[idx % len(colors)] + '20',
                'borderWidth': 2,
                'tension': 0.1,
                'fill': False,
                'spanGaps': True
            })
        
        return jsonify({
            'labels': all_dates,
            'datasets': datasets
        })
        
    except Exception as e:
        print(f"Compare chart error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/price_chart', methods=['POST'])
def get_price_chart():
    """Get price data grouped by sale_date for chart"""
    try:
        data = request.json
        log_activity('/api/price_chart', 'Simple Search', {
            'wool_type': data.get('wool_type_search'),
            'filter_count': len(data.get('column_filters', []))
        })
        
        # Build query with filters - get price, bales, and other fields for table view
        query = """
            SELECT 
                sale_date,
                price,
                bales,
                type_combined,
                colour,
                vegetable_matter
            FROM auction_data_joined
            WHERE price > 10 AND bales > 0
        """
        
        params = []
        
        # Apply same filters as search - wool type search
        if data.get('wool_type_search'):
            search_term = data['wool_type_search'].strip()
            if search_term:
                query += " AND (CAST(wool_type_id AS CHAR) = %s OR type_combined = %s)"
                params.append(search_term)
                params.append(search_term)
        
        # Apply column filters (same as search endpoint)
        if data.get('column_filters'):
            for filter_item in data['column_filters']:
                column = filter_item.get('column')
                operator = filter_item.get('operator')
                value = filter_item.get('value')
                value2 = filter_item.get('value2')
                
                if not column or not operator or not value:
                    continue
                
                # Security: Validate column name against whitelist
                if column not in ALLOWED_COLUMNS:
                    print(f"Warning: Invalid column name attempted: {column}")
                    continue
                
                # Build filter condition based on operator
                if operator == 'eq':
                    query += f" AND {column} = %s"
                    params.append(value)
                elif operator == 'ne':
                    query += f" AND {column} != %s"
                    params.append(value)
                elif operator == 'gt':
                    query += f" AND {column} > %s"
                    params.append(value)
                elif operator == 'lt':
                    query += f" AND {column} < %s"
                    params.append(value)
                elif operator == 'gte':
                    query += f" AND {column} >= %s"
                    params.append(value)
                elif operator == 'lte':
                    query += f" AND {column} <= %s"
                    params.append(value)
                elif operator == 'between' and value2:
                    query += f" AND {column} BETWEEN %s AND %s"
                    params.append(value)
                    params.append(value2)
                elif operator == 'contains':
                    query += f" AND {column} LIKE %s"
                    params.append(f"%{value}%")
                elif operator == 'not_contains':
                    query += f" AND {column} NOT LIKE %s"
                    params.append(f"%{value}%")
        
        # Don't group yet - get all prices for each date so we can filter outliers
        query += " ORDER BY sale_date ASC"
        
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        all_results = cursor.fetchall()
        
        # Group by sale_date - store (price, bales) tuples for weighted averaging
        from collections import defaultdict
        import statistics
        
        date_data = defaultdict(list)
        for row in all_results:
            if row['sale_date'] and row['price'] and row['bales']:
                date_data[row['sale_date']].append({
                    'price': float(row['price']),
                    'bales': float(row['bales']),
                    'type_combined': row.get('type_combined'),
                    'colour': float(row['colour']) if row.get('colour') is not None else None,
                    'vegetable_matter': float(row['vegetable_matter']) if row.get('vegetable_matter') is not None else None
                })
        
        # Calculate volume-weighted filtered averages
        labels = []
        prices = []
        data_quality = []  # Count of data points used for each average
        stats_data = []  # For statistics summary
        table_data = []  # For table view: date, wooltype, avg colour, avg vm, avg price, # of matched lots
        
        for sale_date in sorted(date_data.keys()):
            items = date_data[sale_date]
            
            if len(items) == 0:
                continue
            
            # Calculate median price for outlier filtering
            price_list = [item['price'] for item in items]
            median_price = statistics.median(price_list)
            
            # Filter outliers: remove items where price is +/- 20% from median
            lower_bound = median_price * 0.8
            upper_bound = median_price * 1.2
            filtered_items = [item for item in items if lower_bound <= item['price'] <= upper_bound]
            
            # If we filtered everything out, use original list
            if len(filtered_items) == 0:
                filtered_items = items
            
            # Calculate volume-weighted average: sum(price * bales) / sum(bales)
            total_weighted_price = sum(item['price'] * item['bales'] for item in filtered_items)
            total_bales = sum(item['bales'] for item in filtered_items)
            
            if total_bales > 0:
                weighted_avg_price = total_weighted_price / total_bales
                weighted_avg_price_dollars = weighted_avg_price / 100  # Convert cents to dollars
                
                # Get wool type (use most common type_combined, or first if all same)
                wool_types = [item['type_combined'] for item in filtered_items if item.get('type_combined')]
                wool_type = wool_types[0] if wool_types else ''
                if len(set(wool_types)) > 1:
                    # Multiple types - use most common
                    from collections import Counter
                    wool_type = Counter(wool_types).most_common(1)[0][0]
                
                # Calculate average colour (simple average, not weighted)
                colours = [item['colour'] for item in filtered_items if item.get('colour') is not None]
                avg_colour = round(statistics.mean(colours), 2) if colours else None
                
                # Calculate average VM (simple average, not weighted)
                vms = [item['vegetable_matter'] for item in filtered_items if item.get('vegetable_matter') is not None]
                avg_vm = round(statistics.mean(vms), 2) if vms else None
            
                labels.append(sale_date.strftime('%Y-%m-%d'))
                prices.append(round(weighted_avg_price_dollars, 2))
                data_quality.append(len(filtered_items))  # Store count of data points
                
                # Store for table view
                table_data.append({
                    'date': sale_date.strftime('%Y-%m-%d'),
                    'wooltype': wool_type,
                    'avg_colour': avg_colour,
                    'avg_vm': avg_vm,
                    'avg_price': round(weighted_avg_price_dollars, 2),
                    'matched_lots': len(filtered_items)
                })
                
                # Store for statistics
                stats_data.extend([item['price'] / 100 for item in filtered_items])
        
        # Calculate statistics summary
        statistics_summary = None
        if len(stats_data) > 0:
            statistics_summary = {
                'min': round(min(stats_data), 2),
                'max': round(max(stats_data), 2),
                'median': round(statistics.median(stats_data), 2),
                'mean': round(statistics.mean(stats_data), 2),
                'std_dev': round(statistics.stdev(stats_data), 2) if len(stats_data) > 1 else 0,
                'count': len(stats_data)
            }
        
        return jsonify({
            'labels': labels,
            'data': prices,
            'data_quality': data_quality,  # Count of data points per date
            'statistics': statistics_summary,
            'table_data': table_data  # For table view
        })
        
    except Exception as e:
        print(f"Price chart error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/export/excel', methods=['POST'])
def export_excel():
    """Export search results to Excel format"""
    try:
        data = request.json
        results = data.get('results', [])
        
        if not results:
            return jsonify({'error': 'No data to export'}), 400
        
        # Convert to DataFrame
        df = pd.DataFrame(results)
        
        # Convert price from cents to dollars
        if 'price' in df.columns:
            df['price'] = df['price'] / 100
        
        # Rename columns for better readability
        column_mapping = {
            'sale_date': 'Sale Date',
            'lot_number': 'Lot Number',
            'wool_type_id': 'Wool Type ID',
            'type_combined': 'Type Combined',
            'price': 'Price ($)',
            'bales': 'Bales',
            'kg': 'KG',
            'colour': 'Colour',
            'micron': 'Micron',
            'yield': 'Yield %',
            'vegetable_matter': 'VM %',
            'location': 'Location',
            'seller_name': 'Seller',
            'farm_brand_name': 'Farm Brand',
            'is_sold': 'Sold'
        }
        
        # Select and rename columns
        df_export = df.rename(columns=column_mapping)
        available_cols = [col for col in column_mapping.values() if col in df_export.columns]
        df_export = df_export[available_cols]
        
        # Create Excel file in memory
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_export.to_excel(writer, index=False, sheet_name='Auction Data')
        
        output.seek(0)
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'auction_data_{timestamp}.xlsx'
        
        return send_file(
            output,
            mimetype='application/vnd.openpyxl-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        print(f"Excel export error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/export/regression-pdf', methods=['POST'])
def export_regression_pdf():
    """Export regression analysis to PDF"""
    if not REPORTLAB_AVAILABLE:
        return jsonify({'error': 'PDF export not available. Install reportlab: pip install reportlab'}), 500
    
    try:
        data = request.json
        regression_data = data.get('regression_data', {})
        
        # Create PDF in memory
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=72, leftMargin=72, topMargin=120, bottomMargin=72)
        
        # Container for the 'Flowable' objects
        elements = []
        
        # Define styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.white,
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#153D33'),
            spaceAfter=12
        )
        
        # Header with dark green strip and logo
        logo_path = os.path.join(BASE_DIR, 'static', 'images', 'Fusca Logos Final_Fusca Logo White-OldGreen.png')
        header_table_data = []
        
        if os.path.exists(logo_path):
            try:
                logo_img = Image(logo_path, width=1.5*inch, height=0.5*inch)
                header_table_data.append([logo_img, Paragraph("Regression Analysis Report", title_style)])
            except:
                header_table_data.append(['', Paragraph("Regression Analysis Report", title_style)])
        else:
            header_table_data.append(['', Paragraph("Regression Analysis Report", title_style)])
        
        header_table = Table(header_table_data, colWidths=[2*inch, 4*inch])
        header_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#153D33')),
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('ALIGN', (1, 0), (1, 0), 'CENTER'),
            ('VALIGN', (0, 0), (-1, 0), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (0, 0), 20),
            ('RIGHTPADDING', (1, 0), (1, 0), 20),
            ('TOPPADDING', (0, 0), (-1, 0), 15),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 15),
        ]))
        
        elements.append(header_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Summary section
        if regression_data.get('summary'):
            summary = regression_data['summary']
            elements.append(Paragraph("Summary Statistics", heading_style))
            
            # Calculate date range from weekly_results if not provided
            date_range = regression_data.get('date_range', 'N/A')
            if date_range == 'N/A' and regression_data.get('weekly_results'):
                weekly_results = regression_data['weekly_results']
                if weekly_results:
                    dates = []
                    for result in weekly_results:
                        week_str = result.get('week', '')
                        # Handle different week formats
                        if '/' in week_str:
                            # Format: "YYYY-MM-DD/YYYY-MM-DD"
                            parts = week_str.split('/')
                            if len(parts) == 2:
                                dates.extend([d.strip() for d in parts])
                        elif 'W' in week_str:
                            # Format: "2025-W32" - convert to date range
                            try:
                                from pandas import Period
                                period = Period(week_str)
                                # Get start and end of week
                                start = period.start_time.strftime('%Y-%m-%d')
                                end = period.end_time.strftime('%Y-%m-%d')
                                dates.extend([start, end])
                            except:
                                pass
                    
                    if dates:
                        # Find min and max dates
                        try:
                            date_objs = [datetime.strptime(d.strip(), '%Y-%m-%d') for d in dates if d.strip()]
                            if date_objs:
                                min_date = min(date_objs).strftime('%Y-%m-%d')
                                max_date = max(date_objs).strftime('%Y-%m-%d')
                                date_range = f"{min_date} to {max_date}"
                        except Exception as e:
                            print(f"Error parsing dates: {e}")
                            pass
            
            summary_data = [
                ['Metric', 'Value'],
                ['Average R²', f"{summary.get('avg_r_squared', 0):.4f}"],
                ['Average Adjusted R²', f"{summary.get('avg_adj_r_squared', 0):.4f}"],
                ['Date Range', date_range],
            ]
            
            summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#153D33')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 10),
            ]))
            elements.append(summary_table)
            elements.append(Spacer(1, 0.3*inch))
        
        # Recent coefficients
        if regression_data.get('weekly_results'):
            elements.append(Paragraph("Recent Coefficients", heading_style))
            
            weekly_results = regression_data['weekly_results'][-10:]  # Last 10 weeks
            if weekly_results:
                coef_data = [['Week', 'Micron', 'Colour', 'Length', 'VM', 'R²', 'Adj R²']]
                
                for result in weekly_results:
                    coef = result.get('coefficients', {})
                    week_str = result.get('week', 'N/A')
                    
                    # Format week string for display
                    if week_str != 'N/A':
                        if 'W' in week_str and '/' not in week_str:
                            # Format: "2025-W32" - convert to date range
                            try:
                                from pandas import Period
                                period = Period(week_str)
                                start = period.start_time.strftime('%Y-%m-%d')
                                end = period.end_time.strftime('%Y-%m-%d')
                                week_str = f"{start}/{end}"
                            except:
                                pass  # Keep original format if conversion fails
                    
                    coef_data.append([
                        week_str,
                        f"{coef.get('micron', 0):.2f}",
                        f"{coef.get('colour', 0):.2f}",
                        f"{coef.get('length_index', 0):.2f}",
                        f"{coef.get('vegetable_matter', 0):.2f}",
                        f"{result.get('r_squared', 0):.4f}",
                        f"{result.get('adj_r_squared', 0):.4f}"
                    ])
                
                # Adjust column widths: Week needs more space, others can be smaller
                # Week: 2.2", others: 0.7" each (total ~6.9" fits on A4 with margins)
                coef_table = Table(coef_data, colWidths=[2.2*inch, 0.7*inch, 0.7*inch, 0.7*inch, 0.7*inch, 0.7*inch, 0.7*inch])
                coef_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#153D33')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (0, -1), 'LEFT'),  # Week column left-aligned
                    ('ALIGN', (1, 0), (-1, -1), 'CENTER'),  # Other columns centered
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black),
                    ('FONTSIZE', (0, 1), (-1, -1), 9),
                ]))
                elements.append(coef_table)
                elements.append(Spacer(1, 0.3*inch))
        
        # Notes
        elements.append(Paragraph("Notes", heading_style))
        notes_text = """
        <b>How to Read Coefficients:</b><br/>
        The coefficients show how price changes (in cents/kg) for each one-unit increase in each variable.
        Negative coefficients mean decreases in value (e.g., higher colour Y-Z or VM = lower price).<br/><br/>
        <b>VM Scaling:</b> For Vegetable Matter, one unit represents a 0.1% change (since VM mostly ranges 0.0-1.0),
        so a coefficient of -20 means a 0.1% increase in VM decreases price by 20 cents/kg.
        """
        elements.append(Paragraph(notes_text, styles['Normal']))
        elements.append(Spacer(1, 0.2*inch))
        
        # Footer
        elements.append(Spacer(1, 0.3*inch))
        footer_text = f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        elements.append(Paragraph(footer_text, styles['Normal']))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'regression_analysis_{timestamp}.pdf'
        
        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        print(f"PDF export error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ==================== EXPORT DATA API ====================

@app.route('/api/export-data/files', methods=['GET'])
def get_export_data_files():
    """Get list of available export data files"""
    try:
        files = get_available_files()
        log_activity('/api/export-data/files', 'Export Data', {'file_count': len(files)})
        return jsonify({'files': files})
    except Exception as e:
        print(f"Error getting export data files: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/export-data/load', methods=['POST'])
def load_export_data_api():
    """Load export data with filters"""
    try:
        data = request.json
        filenames = data.get('filenames', None)
        wool_only = data.get('wool_only', True)
        date_range = data.get('date_range', None)  # [start_date, end_date] in YYYYMM
        countries = data.get('countries', None)
        wool_categories = data.get('wool_categories', None)
        
        log_activity('/api/export-data/load', 'Export Data', {
            'filenames': filenames,
            'wool_only': wool_only,
            'date_range': date_range,
            'country_count': len(countries) if countries else 0,
            'category_count': len(wool_categories) if wool_categories else 0
        })
        
        # Load data
        df = load_export_data(
            filenames=filenames,
            wool_only=wool_only,
            date_range=tuple(date_range) if date_range else None,
            countries=countries,
            wool_categories=wool_categories
        )
        
        if df.empty:
            return jsonify({
                'data': [],
                'summary': get_data_summary(df),
                'message': 'No data found matching criteria'
            })
        
        # Categorize wool data
        df = categorize_wool_data(df)
        
        # Convert to JSON-serializable format
        records = df.to_dict('records')
        
        # Convert numpy types to native Python types
        for record in records:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None
                elif isinstance(value, (np.integer, np.int64)):
                    record[key] = int(value)
                elif isinstance(value, (np.floating, np.float64)):
                    record[key] = float(value)
        
        summary = get_data_summary(df)
        
        return jsonify({
            'data': records,
            'summary': summary,
            'record_count': len(records)
        })
        
    except Exception as e:
        print(f"Error loading export data: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/export-data/aggregate', methods=['POST'])
def aggregate_export_data():
    """Aggregate export data by category, country, or month"""
    try:
        data = request.json
        filenames = data.get('filenames', None)
        wool_only = data.get('wool_only', True)
        date_range = data.get('date_range', None)
        countries = data.get('countries', None)
        wool_categories = data.get('wool_categories', None)
        group_by = data.get('group_by', 'wool_category')  # 'wool_category', 'country', 'month', 'processing_stage', 'micron_range'
        
        log_activity('/api/export-data/aggregate', 'Export Data', {
            'group_by': group_by,
            'filenames': filenames,
            'category_count': len(wool_categories) if wool_categories else 0
        })
        
        # Load data
        df = load_export_data(
            filenames=filenames,
            wool_only=wool_only,
            date_range=tuple(date_range) if date_range else None,
            countries=countries,
            wool_categories=wool_categories
        )
        
        if df.empty:
            return jsonify({'data': [], 'message': 'No data found matching criteria'})
        
        # Categorize wool data
        df = categorize_wool_data(df)
        
        # Aggregate based on group_by
        if group_by == 'country':
            agg_df = aggregate_by_country(df)
        elif group_by == 'month':
            agg_df = aggregate_by_month(df)
        elif group_by in ['wool_category', 'processing_stage', 'micron_range']:
            agg_df = aggregate_by_category(df, group_by=group_by)
        else:
            agg_df = aggregate_by_category(df, group_by='wool_category')
        
        # Convert to JSON-serializable format
        records = agg_df.to_dict('records')
        
        # Convert numpy types to native Python types
        for record in records:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None
                elif isinstance(value, (np.integer, np.int64)):
                    record[key] = int(value)
                elif isinstance(value, (np.floating, np.float64)):
                    record[key] = float(value)
        
        return jsonify({
            'data': records,
            'group_by': group_by,
            'record_count': len(records)
        })
        
    except Exception as e:
        print(f"Error aggregating export data: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/export-data/countries', methods=['GET'])
def get_export_data_countries():
    """Get list of all countries in export data"""
    try:
        df = load_export_data(wool_only=True)
        countries = sorted(df['country'].unique().tolist())
        log_activity('/api/export-data/countries', 'Export Data', {'country_count': len(countries)})
        return jsonify({'countries': countries})
    except Exception as e:
        print(f"Error getting countries: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.teardown_appcontext
def cleanup_connection(error):
    """Keep connection alive across requests in same context"""
    pass

if __name__ == '__main__':
    # Check if running in production (via gunicorn) or development
    is_production = os.environ.get('FLASK_ENV') == 'production'
    
    print("Starting Auction Search GUI...")
    if not is_production:
        print("Open http://localhost:5001 in your browser")
        print("Running in DEVELOPMENT mode")
        app.run(debug=True, host='0.0.0.0', port=5001)
    else:
        print("Running in PRODUCTION mode")
        app.run(debug=False, host='127.0.0.1', port=5001)

