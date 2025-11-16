#!/usr/bin/env python3
"""
Update Export Data Script
Checks Stats NZ website for new export data files and downloads them.
Also checks if provisional files have been updated to final status.

Run this script via cron job on the server (e.g., daily at 2 AM):
0 2 * * * cd /path/to/your/app && /path/to/your/app/venv/bin/python3 /path/to/your/app/scripts/update_export_data.py >> /path/to/your/app/logs/cron_export_update.log 2>&1

Note: Replace paths with your actual server deployment paths.
"""

import os
import sys
import requests
from bs4 import BeautifulSoup
import re
from datetime import datetime
import json
import pandas as pd
from pathlib import Path
import hashlib

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from export_data_loader import EXPORT_DATA_DIR

# Stats NZ page URL
STATS_NZ_URL = "https://www.stats.govt.nz/large-datasets/csv-files-for-download/overseas-merchandise-trade-datasets/"

# Log file for tracking updates
LOG_DIR = os.path.join(os.path.dirname(EXPORT_DATA_DIR), 'logs')
UPDATE_LOG = os.path.join(LOG_DIR, 'export_data_updates.log')

def ensure_log_dir():
    """Ensure log directory exists"""
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)

def log_update(message):
    """Log update activity"""
    ensure_log_dir()
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] {message}\n"
    
    with open(UPDATE_LOG, 'a') as f:
        f.write(log_entry)
    
    print(log_entry.strip())

def get_existing_files():
    """Get list of existing files and their metadata"""
    existing = {}
    
    if not os.path.exists(EXPORT_DATA_DIR):
        return existing
    
    for filename in os.listdir(EXPORT_DATA_DIR):
        if filename.endswith('.csv') and 'Exports_HS10_by_Country' in filename:
            filepath = os.path.join(EXPORT_DATA_DIR, filename)
            try:
                stat = os.stat(filepath)
                existing[filename] = {
                    'path': filepath,
                    'size': stat.st_size,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'status': check_file_status(filepath)
                }
            except Exception as e:
                log_update(f"Error reading file {filename}: {str(e)}")
    
    return existing

def check_file_status(filepath):
    """Check if file contains provisional or final data"""
    try:
        # Read first few rows to check status
        df = pd.read_csv(filepath, nrows=1000)
        if 'status' in df.columns:
            statuses = df['status'].unique()
            if 'Provisional' in statuses:
                return 'provisional'
            elif 'Final' in statuses:
                return 'final'
        return 'unknown'
    except Exception as e:
        log_update(f"Error checking status of {filepath}: {str(e)}")
        return 'unknown'

def get_file_hash(filepath):
    """Get MD5 hash of file for comparison"""
    try:
        hash_md5 = hashlib.md5()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except Exception as e:
        log_update(f"Error hashing file {filepath}: {str(e)}")
        return None

def scrape_download_links():
    """Scrape Stats NZ page for CSV download links"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(STATS_NZ_URL, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find the pageViewData div with JSON-encoded content
        page_data_div = soup.find('div', {'id': 'pageViewData'})
        links = []
        
        if page_data_div and page_data_div.get('data-value'):
            try:
                # Parse the JSON data
                page_data = json.loads(page_data_div['data-value'])
                
                # Extract HTML content from PageBlocks
                if 'PageBlocks' in page_data:
                    for block in page_data['PageBlocks']:
                        if 'Content' in block:
                            # Parse the HTML content from the block
                            content_html = block['Content']
                            block_soup = BeautifulSoup(content_html, 'html.parser')
                            
                            # Find all links in this block
                            for link in block_soup.find_all('a', href=True):
                                href = link.get('href', '')
                                
                                # Only process Exports_HS10_by_Country CSV files
                                if 'Exports_HS10_by_Country' in href and href.endswith('.csv'):
                                    # Handle relative URLs
                                    if href.startswith('/'):
                                        full_url = f"https://www.stats.govt.nz{href}"
                                    elif href.startswith('http'):
                                        full_url = href
                                    else:
                                        # Relative URL
                                        full_url = f"https://www.stats.govt.nz/{href.lstrip('/')}"
                                    
                                    # Extract filename from URL
                                    filename = os.path.basename(href.split('?')[0])
                                    
                                    if filename.endswith('.csv'):
                                        links.append({
                                            'url': full_url,
                                            'filename': filename,
                                            'link_text': link.get_text(strip=True)
                                        })
                
            except json.JSONDecodeError as e:
                log_update(f"Error parsing JSON data: {str(e)}")
        
        # Also check for any direct links in the page (fallback)
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            if 'Exports_HS10_by_Country' in href and href.endswith('.csv'):
                if href.startswith('/'):
                    full_url = f"https://www.stats.govt.nz{href}"
                elif href.startswith('http'):
                    full_url = href
                else:
                    continue
                
                filename = os.path.basename(href.split('?')[0])
                if filename.endswith('.csv'):
                    # Check if we already have this link
                    if not any(l['filename'] == filename for l in links):
                        links.append({
                            'url': full_url,
                            'filename': filename,
                            'link_text': link.get_text(strip=True)
                        })
        
        log_update(f"Found {len(links)} potential download links on Stats NZ page")
        return links
        
    except Exception as e:
        log_update(f"Error scraping Stats NZ page: {str(e)}")
        import traceback
        traceback.print_exc()
        return []

def download_file(url, filename):
    """Download a file from URL"""
    try:
        # Ensure export_data directory exists
        if not os.path.exists(EXPORT_DATA_DIR):
            os.makedirs(EXPORT_DATA_DIR)
        
        filepath = os.path.join(EXPORT_DATA_DIR, filename)
        temp_filepath = filepath + '.tmp'
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=120, stream=True)
        response.raise_for_status()
        
        # Download to temp file first
        total_size = 0
        chunk_size = 8192
        
        with open(temp_filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
                    total_size += len(chunk)
        
        # Verify it's a valid CSV (at least has some content)
        if total_size < 100:
            os.remove(temp_filepath)
            log_update(f"Skipped {filename}: File too small ({total_size} bytes)")
            return False
        
        # Move temp file to final location
        if os.path.exists(filepath):
            os.remove(filepath)
        os.rename(temp_filepath, filepath)
        
        log_update(f"Downloaded {filename} ({total_size:,} bytes)")
        return True
        
    except Exception as e:
        log_update(f"Error downloading {filename}: {str(e)}")
        # Clean up temp file if it exists
        if os.path.exists(temp_filepath):
            try:
                os.remove(temp_filepath)
            except:
                pass
        return False

def check_and_update_files():
    """Main function to check for new files and updates"""
    log_update("=" * 60)
    log_update("Starting export data update check")
    
    # Get existing files
    existing_files = get_existing_files()
    log_update(f"Found {len(existing_files)} existing files")
    
    # Scrape download links
    download_links = scrape_download_links()
    
    if not download_links:
        log_update("No download links found. Website structure may have changed.")
        return
    
    # Track what we've processed
    new_files = []
    updated_files = []
    checked_files = set()
    
    for link_info in download_links:
        filename = link_info['filename']
        url = link_info['url']
        
        # Skip if we've already processed this file
        if filename in checked_files:
            continue
        checked_files.add(filename)
        
        filepath = os.path.join(EXPORT_DATA_DIR, filename)
        
        if filename in existing_files:
            # File exists - check if it needs updating
            existing = existing_files[filename]
            current_status = existing.get('status', 'unknown')
            
            # Download to temp location first to check status
            temp_path = filepath + '.tmp'
            if download_file(url, filename + '.tmp'):
                new_status = check_file_status(temp_path)
                new_size = os.path.getsize(temp_path)
                
                # If status changed from provisional to final, update
                if current_status == 'provisional' and new_status == 'final':
                    # Replace old file
                    if os.path.exists(filepath):
                        os.remove(filepath)
                    os.rename(temp_path, filepath)
                    updated_files.append(filename)
                    log_update(f"Updated {filename}: Provisional -> Final")
                elif current_status == 'provisional' and new_status == 'provisional':
                    # Check if file size changed (might be updated provisional)
                    if new_size != existing['size']:
                        if os.path.exists(filepath):
                            os.remove(filepath)
                        os.rename(temp_path, filepath)
                        updated_files.append(filename)
                        log_update(f"Updated {filename}: Provisional data refreshed (size changed: {existing['size']:,} -> {new_size:,} bytes)")
                    else:
                        # Check hash to see if content changed
                        old_hash = get_file_hash(filepath)
                        new_hash = get_file_hash(temp_path)
                        if old_hash != new_hash:
                            if os.path.exists(filepath):
                                os.remove(filepath)
                            os.rename(temp_path, filepath)
                            updated_files.append(filename)
                            log_update(f"Updated {filename}: Provisional data refreshed (content changed)")
                        else:
                            os.remove(temp_path)
                            log_update(f"No changes detected for {filename}")
                elif current_status == 'final' and new_status == 'final':
                    # Check if file size changed (rare, but possible)
                    if new_size != existing['size']:
                        if os.path.exists(filepath):
                            os.remove(filepath)
                        os.rename(temp_path, filepath)
                        updated_files.append(filename)
                        log_update(f"Updated {filename}: Final data refreshed (size changed)")
                    else:
                        os.remove(temp_path)
                        log_update(f"No changes detected for {filename}")
                else:
                    # No change needed
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
        else:
            # New file - download it
            if download_file(url, filename):
                new_files.append(filename)
                log_update(f"New file downloaded: {filename}")
    
    # Summary
    log_update("-" * 60)
    if new_files:
        log_update(f"Downloaded {len(new_files)} new file(s): {', '.join(new_files)}")
    else:
        log_update("No new files found")
    
    if updated_files:
        log_update(f"Updated {len(updated_files)} file(s): {', '.join(updated_files)}")
    else:
        log_update("No files needed updating")
    
    log_update("Export data update check completed")
    log_update("=" * 60)

if __name__ == '__main__':
    try:
        check_and_update_files()
    except Exception as e:
        log_update(f"Fatal error in update script: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

