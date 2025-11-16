# Export Data Auto-Update Script

## Overview

The `update_export_loader.py` script automatically checks the Stats NZ website for new export data files and downloads them. It also detects when provisional files are updated to final status.

## Features

- **Automatic File Detection**: Scrapes the Stats NZ page for CSV download links
- **New File Download**: Downloads new files that don't exist locally
- **Provisional to Final Updates**: Detects when provisional files are updated to final status
- **Content Change Detection**: Uses file size and hash comparison to detect updates
- **Logging**: Comprehensive logging of all activities

## Setup

### 1. Install Dependencies

```bash
pip install requests beautifulsoup4 pandas
```

### 2. Make Script Executable

```bash
chmod +x scripts/update_export_loader.py
```

### 3. Test Run

```bash
python3 scripts/update_export_loader.py
```

## Cron Job Setup

**Important**: The paths below should be **server paths**, not local development paths. Adjust them based on where your application is deployed.

### Finding Your Server Paths

1. **Application root directory**: Where your Flask app is located on the server
   ```bash
   # On server, find your app directory:
   pwd  # If you're in the app directory
   # Or check your deployment documentation
   ```

2. **Python virtual environment**: Path to your venv's python3
   ```bash
   # On server, find your venv:
   which python3  # If using system Python
   # Or: /path/to/your/app/venv/bin/python3
   ```

3. **Script path**: Full path to the update script
   ```bash
   # On server:
   /var/www/fusca/fusca_pro_lookup/scripts/update_export_loader.py
   ```

### Option 1: Daily at 2 AM (Recommended)

```bash
# Edit crontab on server
crontab -e

# Add this line:
0 2 * * * /var/www/fusca/fusca_pro_lookup/venv/bin/python3 /var/www/fusca/fusca_pro_lookup/scripts/update_export_loader.py >> /var/www/fusca/fusca_pro_lookup/logs/cron_export_update.log 2>&1
```

**Note**: The `cd` command is not needed when using absolute paths. The script will run from wherever cron executes it, and the script uses absolute paths internally.

### Option 2: Multiple Times Per Day

```bash
# Check at 2 AM and 2 PM
0 2,14 * * * /var/www/fusca/fusca_pro_lookup/venv/bin/python3 /var/www/fusca/fusca_pro_lookup/scripts/update_export_loader.py >> /var/www/fusca/fusca_pro_lookup/logs/cron_export_update.log 2>&1
```

### Verifying the Cron Job

After setting up, verify it's scheduled:
```bash
# On server:
crontab -l
```

Test the script manually first:
```bash
# On server:
/var/www/fusca/fusca_pro_lookup/venv/bin/python3 /var/www/fusca/fusca_pro_lookup/scripts/update_export_loader.py
```

## How It Works

1. **Scrapes Stats NZ Page**: 
   - Parses the JavaScript-rendered page content from the `data-value` JSON attribute
   - Extracts all links to `Exports_HS10_by_Country.csv` files
   - Currently focuses on monthly CSV files (yearly ZIP files can be added later if needed)

2. **Compares with Existing Files**: Checks which files already exist locally

3. **Downloads New Files**: Downloads any files that don't exist

4. **Checks for Updates**: 
   - Downloads file to temporary location first
   - Compares file sizes
   - Compares file hashes (MD5) for content changes
   - Checks status column in CSV (provisional vs final)

5. **Updates Files**: Replaces files when:
   - Provisional → Final status change
   - File size changed (for provisional files)
   - File content changed (hash mismatch, even if size is same)
   - Final files with size changes (rare, but possible)

6. **Logs Everything**: All activities logged to `logs/export_data_updates.log`

## Log File Location

Logs are stored in: `logs/export_data_updates.log`

Each entry includes:
- Timestamp
- Action taken (download, update, skip)
- File name
- File size
- Status changes

## Manual Execution

You can run the script manually at any time:

**On the server:**
```bash
/var/www/fusca/fusca_pro_lookup/venv/bin/python3 /var/www/fusca/fusca_pro_lookup/scripts/update_export_loader.py
```

**Locally (for testing):**
```bash
cd /Users/ryan/Dropbox/Laravel/fusca_pro_loockup
python3 scripts/update_export_loader.py
```

## Troubleshooting

### Website Structure Changed

If the script stops finding files, the Stats NZ website structure may have changed. Check the log file for errors.

### Permission Issues

Ensure the script has write permissions to:
- `export_data/` directory (on server)
- `logs/` directory (on server)

On the server, you may need to:
```bash
# Set proper ownership (adjust user/group as needed)
chown -R www-data:www-data /var/www/fusca/fusca_pro_lookup/export_data
chown -R www-data:www-data /var/www/fusca/fusca_pro_lookup/logs

# Or set permissions
chmod -R 755 /var/www/fusca/fusca_pro_lookup/export_data
chmod -R 755 /var/www/fusca/fusca_pro_lookup/logs
```

### Network Issues

The script includes timeout handling. If downloads fail, check:
- Internet connectivity
- Stats NZ website availability
- Firewall/proxy settings

## Future Enhancements

Potential improvements:
- Email notifications when new files are found
- Slack/webhook notifications
- Retry logic for failed downloads
- Parallel downloads for multiple files
- File validation (check CSV structure)

