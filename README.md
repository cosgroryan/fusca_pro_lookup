# Fusca Pro Lookup

A web-based auction data search and analysis tool for wool auction records.

## Features

- **Wool Type Search**: Search by wool type ID or name (e.g., F2N, MULTI)
- **Excel-Style Column Filters**: Add multiple filters with operators like:
  - Numbers: Equals, Greater Than, Less Than, Between, etc.
  - Text: Contains, Does Not Contain, Equals, etc.
  - Dates: Equals, After, Before, Between
- **Results Table**: View up to 1,000 matching records with all details
- **Price Chart**: Average price over time with outlier filtering (±20% from median)
- **Automatic Outlier Removal**: Filters out bad data entries in price charts

## Installation

### Prerequisites
- Python 3.9+
- SSH access to the database server
- SSH key at `~/.ssh/id_rsa_nopass`

### Setup

1. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure database connection:
   - Edit `db_connector.py` if needed to update:
     - SSH host and credentials
     - Database host, user, password, and database name

## Usage

1. Start the application:
```bash
python app.py
```

2. Open your browser to:
```
http://localhost:5001
```

3. Search and filter:
   - Enter wool type (optional)
   - Click "+ Add Filter" to add column filters
   - Click "Search" to view results

## Database Connection

The app connects to a remote MySQL database via SSH tunnel:
- Remote server: `120.138.27.51:22`
- Database: `fuscadb`
- Table: `auction_data_joined`

## Features in Detail

### Price Display
- All prices are automatically converted from cents to dollars
- Display format: $X.XX

### Chart Outlier Filtering
For each sale date, the chart:
1. Calculates the median price
2. Removes outliers (prices ±20% from median)
3. Averages the remaining prices
4. Displays the filtered average

This handles erroneous data entries automatically.

### Available Columns for Filtering
- Price, Bales, KG
- Colour, Micron, Yield %, Vegetable Matter %
- Sale Date, Location
- Seller, Farm Brand

## Development

The app uses:
- **Flask** for the web framework
- **MySQL Connector** for database access
- **SSH Tunnel** for secure database connection
- **Chart.js** for data visualization

## Notes

- Results limited to 1,000 records for performance
- Persistent database connection with automatic retry
- Prices filtered with `price > 10` to exclude invalid entries

