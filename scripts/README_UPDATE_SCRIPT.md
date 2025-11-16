# Export Data Auto-Update Script

## Overview

The `update_export_data.py` script automatically checks the Stats NZ website for new export data files and downloads them. It also detects when provisional files are updated to final status.

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
chmod +x scripts/update_export_data.py
```

### 3. Test Run

```bash
python3 scripts/update_export_data.py
```

## Cron Job Setup

### Option 1: Daily at 2 AM

```bash
# Edit crontab
crontab -e

# Add this line (adjust paths as needed)
0 2 * * * cd /Users/ryan/Dropbox/Laravel/fusca_pro_loockup && /path/to/venv/bin/python3 scripts/update_export_data.py >> /path/to/logs/cron_export_update.log 2>&1
```

### Option 2: Daily at 2 AM (using absolute paths)

```bash
0 2 * * * /Users/ryan/Dropbox/Laravel/fusca_pro_loockup/venv/bin/python3 /Users/ryan/Dropbox/Laravel/fusca_pro_loockup/scripts/update_export_data.py
```

### Option 3: Multiple Times Per Day

```bash
# Check at 2 AM and 2 PM
0 2,14 * * * /path/to/venv/bin/python3 /path/to/scripts/update_export_data.py
```

## How It Works

1. **Scrapes Stats NZ Page**: Uses BeautifulSoup to parse the HTML and find CSV download links
2. **Compares with Existing Files**: Checks which files already exist locally
3. **Downloads New Files**: Downloads any files that don't exist
4. **Checks for Updates**: 
   - Compares file sizes
   - Compares file hashes (MD5)
   - Checks status (provisional vs final)
5. **Updates Files**: Replaces files when:
   - Provisional → Final status change
   - File size/content changed
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

```bash
cd /Users/ryan/Dropbox/Laravel/fusca_pro_loockup
python3 scripts/update_export_data.py
```

## Troubleshooting

### Website Structure Changed

If the script stops finding files, the Stats NZ website structure may have changed. Check the log file for errors.

### Permission Issues

Ensure the script has write permissions to:
- `export_data/` directory
- `logs/` directory

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

