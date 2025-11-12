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

app = Flask(__name__)

# Security: Whitelist of allowed columns for filtering
ALLOWED_COLUMNS = {
    'price', 'bales', 'kg', 'colour', 'micron', 'yield', 
    'vegetable_matter', 'sale_date', 'location', 
    'seller_name', 'farm_brand_name', 'wool_type_id',
    'type_combined', 'lot_number', 'is_sold'
}

# Global connection with retry logic
_db_conn = None
_db_tunnel = None
_last_connection_time = 0

def get_db():
    """Get or create database connection with retry logic"""
    global _db_conn, _db_tunnel, _last_connection_time
    
    # Check if connection is still valid
    try:
        if _db_conn and _db_conn.is_connected():
            return _db_conn, _db_tunnel
    except:
        pass
    
    # Need new connection - add small delay to avoid port conflicts
    current_time = time.time()
    if current_time - _last_connection_time < 1:
        time.sleep(0.5)
    
    # Close old connection if exists
    if _db_tunnel:
        try:
            _db_tunnel.stop()
        except:
            pass
    if _db_conn:
        try:
            _db_conn.close()
        except:
            pass
    
    # Create new connection with retries
    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"Connecting to database (attempt {attempt + 1}/{max_retries})...")
            _db_conn, _db_tunnel = get_db_connection()
            _last_connection_time = time.time()
            print("Database connected successfully!")
            return _db_conn, _db_tunnel
        except Exception as e:
            print(f"Connection attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                raise
    
    raise Exception("Failed to establish database connection after retries")

@app.route('/')
def index():
    """Main page"""
    return render_template('auction_search.html')

@app.route('/test-static')
def test_static():
    """Test static folder"""
    import os
    return jsonify({
        'static_folder': app.static_folder,
        'static_url_path': app.static_url_path,
        'cwd': os.getcwd(),
        'static_exists': os.path.exists(app.static_folder),
        'logo_exists': os.path.exists(os.path.join(app.static_folder, 'images', 'fusca-logo.png')),
        'files_in_static': os.listdir(app.static_folder) if os.path.exists(app.static_folder) else []
    })

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
    import os
    
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

