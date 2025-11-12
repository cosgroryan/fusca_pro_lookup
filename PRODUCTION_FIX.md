# Fix for Production 500 Errors

## Problem Fixed: Gunicorn Workers Conflict

**Issue:** Multiple Gunicorn workers were fighting over SSH tunnel port 33306, causing intermittent 500 errors.

**Solution:** Changed tunnel to use dynamic port assignment (port 0 = auto-assign).

---

## Deploy the Fix to EC2

### Step 1: Update Code on EC2

**On your local machine:**
```bash
# Option A: If using git
git add .
git commit -m "Fix multi-worker tunnel conflicts, add bales chart"
git push

# Then on EC2:
cd /var/www/fusca/fusca_pro_lookup
git pull
```

**OR Option B: Upload files directly**
```bash
# From local machine:
scp -i ~/path/to/ec2-key.pem db_connector.py ubuntu@YOUR-EC2-IP:/tmp/
scp -i ~/path/to/ec2-key.pem app.py ubuntu@YOUR-EC2-IP:/tmp/
scp -i ~/path/to/ec2-key.pem templates/auction_search.html ubuntu@YOUR-EC2-IP:/tmp/

# Then on EC2:
sudo cp /tmp/db_connector.py /var/www/fusca/fusca_pro_lookup/
sudo cp /tmp/app.py /var/www/fusca/fusca_pro_lookup/
sudo cp /tmp/auction_search.html /var/www/fusca/fusca_pro_lookup/templates/
sudo chown -R ubuntu:ubuntu /var/www/fusca/fusca_pro_lookup/
```

### Step 2: Restart the Service

```bash
# On EC2
sudo systemctl restart fusca
sudo systemctl status fusca
```

### Step 3: Watch the Logs (verify it works)

```bash
sudo journalctl -u fusca -f
```

You should see:
```
tunnel found on local port 45123  (or whatever port)
Connected via SSH tunnel on port 45123
```

Each worker will use a **different port**, preventing conflicts!

### Step 4: Test

```bash
# Test multiple times - should work consistently now
curl http://localhost/api/filters
curl http://localhost/api/filters
curl http://localhost/api/filters
```

All requests should return 200, no more 500 errors!

---

## What Changed

**Before:**
```python
local_bind_address=('127.0.0.1', 33306)  # Fixed port - conflicts!
port=33306  # All workers try to use same port
```

**After:**
```python
local_bind_address=('127.0.0.1', 0)  # Port 0 = auto-assign
port=local_port  # Each worker gets unique port
```

**Result:**
- Worker 1: Port 45123
- Worker 2: Port 45124
- Worker 3: Port 45125
- No conflicts! ✅

---

## Benefits

✅ No more tunnel conflicts  
✅ No more intermittent 500 errors  
✅ All 3 workers can handle requests simultaneously  
✅ Better performance and reliability  

---

## Bonus: New Feature Added

Also added **Total Bales chart** above the table:
- Column/bar chart
- Shows SUM(bales) grouped by sale_date
- Respects all filters
- Appears between price chart and table

---

## Quick Deploy Commands

```bash
# Upload updated files
scp -i ~/your-ec2-key.pem \
  db_connector.py app.py templates/auction_search.html \
  ubuntu@YOUR-EC2-IP:/tmp/

# SSH and deploy
ssh -i ~/your-ec2-key.pem ubuntu@YOUR-EC2-IP
sudo cp /tmp/db_connector.py /var/www/fusca/fusca_pro_lookup/
sudo cp /tmp/app.py /var/www/fusca/fusca_pro_lookup/
sudo cp /tmp/auction_search.html /var/www/fusca/fusca_pro_lookup/templates/
sudo chown -R ubuntu:ubuntu /var/www/fusca/fusca_pro_lookup/
sudo systemctl restart fusca

# Watch it work
sudo journalctl -u fusca -f
```

Done! No more 500 errors. 🎉

