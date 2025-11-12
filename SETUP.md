# Setup Instructions

## Creating a New Git Repository

1. **Initialize the repository:**
```bash
cd /Users/ryan/Dropbox/Laravel/fusca_pro_loockup
git init
```

2. **Add all files:**
```bash
git add .
```

3. **Make initial commit:**
```bash
git commit -m "Initial commit: Fusca Pro Lookup tool"
```

4. **Create GitHub repository** (on GitHub website):
   - Go to https://github.com/new
   - Repository name: `fusca-pro-lookup`
   - Description: "Wool auction data search and analysis tool"
   - Make it Private or Public as needed
   - Don't initialize with README (we already have one)

5. **Connect to GitHub:**
```bash
git remote add origin https://github.com/YOUR_USERNAME/fusca-pro-lookup.git
git branch -M main
git push -u origin main
```

## Quick Start

### Option 1: Using the startup script
```bash
./start.sh
```

### Option 2: Manual start
```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

Then open http://localhost:5001 in your browser.

## Configuration

Edit `db_connector.py` to update database connection settings:
- SSH host/port
- SSH key path
- Database credentials
- Database name and table

## Files in This Repository

- `app.py` - Main Flask application
- `db_connector.py` - Database connection with SSH tunnel
- `templates/auction_search.html` - Frontend UI
- `requirements.txt` - Python dependencies
- `start.sh` - Startup script
- `README.md` - Documentation
- `.gitignore` - Git ignore rules

