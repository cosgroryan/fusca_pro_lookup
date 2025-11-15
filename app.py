#!/usr/bin/env python3
"""
Auction Data Search GUI
A Flask web app for searching and visualizing auction data
"""

from flask import Flask, render_template, request, jsonify, g
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

app = Flask(__name__)

# Configure log file path (outside git repo to avoid conflicts)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Place log in parent directory (outside git repo)
LOG_FILE = os.path.join(os.path.dirname(BASE_DIR), 'saved_searches.log')

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
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        log_entry = f"[{timestamp}] Saved Search: {data.get('name', 'Unnamed')}"
        if data.get('filters'):
            log_entry += f" | Filters: {json.dumps(data['filters'])}"
        
        print(log_entry)
        
        # Also write to a log file
        with open(LOG_FILE, 'a') as f:
            f.write(log_entry + '\n')
        
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
                query += " AND (CAST(wool_type_id AS CHAR) LIKE %s OR type_combined LIKE %s)"
                params.append(f"%{search_term}%")
                params.append(f"%{search_term}%")
        
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
        
        return jsonify({
            'count': len(results),
            'results': results
        })
        
    except Exception as e:
        print(f"Search error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/bales_chart', methods=['POST'])
def get_bales_chart():
    """Get bales data grouped by sale_date for chart"""
    try:
        data = request.json
        
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
                query += " AND (CAST(wool_type_id AS CHAR) LIKE %s OR type_combined LIKE %s)"
                params.append(f"%{search_term}%")
                params.append(f"%{search_term}%")
        
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
                    AND (CAST(wool_type_id AS CHAR) LIKE %s OR type_combined LIKE %s)
                """
                
                params = [f"%{wool_type}%", f"%{wool_type}%"]
            
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
                AND (CAST(wool_type_id AS CHAR) LIKE %s OR type_combined LIKE %s)
            """
            
            params = [f"%{wool_type}%", f"%{wool_type}%"]
            
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
        
        # Build query with filters - get price AND bales for volume-weighted averages
        query = """
            SELECT 
                sale_date,
                price,
                bales
            FROM auction_data_joined
            WHERE price > 10 AND bales > 0
        """
        
        params = []
        
        # Apply same filters as search - wool type search
        if data.get('wool_type_search'):
            search_term = data['wool_type_search'].strip()
            if search_term:
                query += " AND (CAST(wool_type_id AS CHAR) LIKE %s OR type_combined LIKE %s)"
                params.append(f"%{search_term}%")
                params.append(f"%{search_term}%")
        
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
                    'bales': float(row['bales'])
                })
        
        # Calculate volume-weighted filtered averages
        labels = []
        prices = []
        stats_data = []  # For statistics summary
        
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
            
                labels.append(sale_date.strftime('%Y-%m-%d'))
                prices.append(round(weighted_avg_price_dollars, 2))
                
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
            'statistics': statistics_summary
        })
        
    except Exception as e:
        print(f"Price chart error: {str(e)}")
        import traceback
        traceback.print_exc()
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

