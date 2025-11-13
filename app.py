#!/usr/bin/env python3
"""
Auction Data Search GUI
A Flask web app for searching and visualizing auction data
"""

from flask import Flask, render_template, request, jsonify, g
from db_connector import get_db_connection
from datetime import datetime
import json
import time
import threading
import os

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
                        price
                    FROM auction_data_joined
                    WHERE price > 10
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
                
                # Group by date for THIS specific type
                type_date_prices = defaultdict(list)
                for row in results:
                    if row['sale_date'] and row['price']:
                        type_date_prices[row['sale_date']].append(float(row['price']))
                
                # Calculate filtered averages for THIS type
                type_data = {}
                for sale_date in sorted(type_date_prices.keys()):
                    price_list = type_date_prices[sale_date]
                    
                    if len(price_list) == 0:
                        continue
                    
                    # Calculate median
                    median_price = statistics.median(price_list)
                    
                    # Filter outliers: remove values +/- 20% from median (only if more than 1 value)
                    if len(price_list) > 1:
                        lower_bound = median_price * 0.8
                        upper_bound = median_price * 1.2
                        filtered_prices = [p for p in price_list if lower_bound <= p <= upper_bound]
                        
                        # If we filtered everything out, use original list
                        if len(filtered_prices) == 0:
                            filtered_prices = price_list
                    else:
                        filtered_prices = price_list
                    
                    # Calculate average of filtered prices and convert cents to dollars
                    avg_price = sum(filtered_prices) / len(filtered_prices)
                    avg_price_dollars = avg_price / 100
                    date_key = sale_date.strftime('%Y-%m-%d')
                    type_data[date_key] = avg_price_dollars
                
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
                    price
                FROM auction_data_joined
                WHERE price > 10
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
            
            # Group by date and calculate average with outlier filtering
            from collections import defaultdict
            import statistics
            
            date_prices = defaultdict(list)
            for row in results:
                if row['sale_date'] and row['price']:
                    date_prices[row['sale_date']].append(float(row['price']))
            
            # Calculate filtered averages (same logic as blend mode)
            series_data = {}
            for sale_date in sorted(date_prices.keys()):
                price_list = date_prices[sale_date]
                
                if len(price_list) == 0:
                    continue
                
                # Calculate median
                median_price = statistics.median(price_list)
                
                # Filter outliers: remove values +/- 20% from median (only if more than 1 value)
                if len(price_list) > 1:
                    lower_bound = median_price * 0.8
                    upper_bound = median_price * 1.2
                    filtered_prices = [p for p in price_list if lower_bound <= p <= upper_bound]
                    
                    # If we filtered everything out, use original list
                    if len(filtered_prices) == 0:
                        filtered_prices = price_list
                else:
                    filtered_prices = price_list
                
                # Calculate average of filtered prices and convert cents to dollars
                avg_price = sum(filtered_prices) / len(filtered_prices)
                avg_price_dollars = avg_price / 100
                date_key = sale_date.strftime('%Y-%m-%d')
                series_data[date_key] = round(avg_price_dollars, 2)
            
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
        
        # Build query with filters - get individual prices for outlier filtering
        query = """
            SELECT 
                sale_date,
                price
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
        
        # Don't group yet - get all prices for each date so we can filter outliers
        query += " ORDER BY sale_date ASC"
        
        conn, tunnel = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        all_results = cursor.fetchall()
        
        # Group by sale_date and remove outliers
        from collections import defaultdict
        import statistics
        
        date_prices = defaultdict(list)
        for row in all_results:
            if row['sale_date'] and row['price']:
                date_prices[row['sale_date']].append(float(row['price']))
        
        # Calculate filtered averages
        labels = []
        prices = []
        
        for sale_date in sorted(date_prices.keys()):
            price_list = date_prices[sale_date]
            
            if len(price_list) == 0:
                continue
            
            # Calculate median
            median_price = statistics.median(price_list)
            
            # Filter outliers: remove values +/- 20% from median
            lower_bound = median_price * 0.8
            upper_bound = median_price * 1.2
            filtered_prices = [p for p in price_list if lower_bound <= p <= upper_bound]
            
            # If we filtered everything out, use original list
            if len(filtered_prices) == 0:
                filtered_prices = price_list
            
            # Calculate average of filtered prices and convert cents to dollars
            avg_price = sum(filtered_prices) / len(filtered_prices)
            avg_price_dollars = avg_price / 100  # Convert cents to dollars
            
            labels.append(sale_date.strftime('%Y-%m-%d'))
            prices.append(round(avg_price_dollars, 2))
        
        return jsonify({
            'labels': labels,
            'data': prices
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

