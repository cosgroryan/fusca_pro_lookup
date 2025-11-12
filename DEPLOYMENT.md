# Deployment Guide - AWS EC2

## Simple Deployment Plan for Fusca Pro Lookup

### Prerequisites
- AWS Account
- SSH key pair for EC2 access
- Database credentials (for SSH tunnel connection)

---

## Step 1: Launch EC2 Instance

1. **EC2 Instance Type**: `t2.micro` or `t3.micro` (free tier eligible)
2. **AMI**: Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
3. **Security Group Rules**:
   - SSH (Port 22) - Your IP only
   - HTTP (Port 80) - 0.0.0.0/0
   - HTTPS (Port 443) - 0.0.0.0/0 (optional, for SSL)
4. **Storage**: 8-10 GB is sufficient
5. **Key Pair**: Create or use existing key for SSH access

---

## Step 2: Connect to EC2 Instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

---

## Step 3: Initial Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Python 3 and pip
sudo apt install python3 python3-pip python3-venv -y

# Install Nginx (web server / reverse proxy)
sudo apt install nginx -y

# Install git (to clone your repo)
sudo apt install git -y
```

---

## Step 4: Clone and Setup Application

```bash
# Create application directory
sudo mkdir -p /var/www/fusca
sudo chown ubuntu:ubuntu /var/www/fusca
cd /var/www/fusca

# Clone repository (or upload files via SCP)
git clone https://github.com/cosgroryan/fusca_pro_lookup 
# OR upload files manually:
# scp -i your-key.pem -r /path/to/fusca_pro_loockup ubuntu@your-ec2-ip:/var/www/fusca

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt

# Install Gunicorn (production WSGI server)
pip install gunicorn
```

---

## Step 5: Configure Environment Variables

```bash
# Create environment file for database credentials
sudo nano /etc/fusca-env.conf
```

Add your database credentials:
```bash
# Database Configuration (READ-ONLY USER)
DB_HOST=mysql57
DB_PORT=3306
DB_USER=fuscaread
DB_PASSWORD=ydv.mqy3avy7jxj6WXZ
DB_NAME=fuscadb

# SSH Tunnel Configuration
SSH_HOST=120.138.27.51
SSH_PORT=22
SSH_USER=appfusca
SSH_KEY_PATH=/home/ubuntu/.ssh/id_rsa_nopass
```

---

## Step 6: Create Systemd Service

Create service file to auto-start the application:

```bash
sudo nano /etc/systemd/system/fusca.service
```

Paste this configuration:
```ini
[Unit]
Description=Fusca Pro Lookup - Auction Data Search
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/var/www/fusca
Environment="PATH=/var/www/fusca/venv/bin"
EnvironmentFile=/etc/fusca-env.conf
ExecStart=/var/www/fusca/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:5001 app:app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable fusca
sudo systemctl start fusca
sudo systemctl status fusca
```

---

## Step 7: Configure Nginx as Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/fusca
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # or use EC2 public IP

    # Increase timeout for long-running queries
    proxy_read_timeout 300;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static {
        alias /var/www/fusca/static;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Increase max upload size if needed
    client_max_body_size 10M;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/fusca /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Step 8: Configure Firewall (Optional but Recommended)

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw --force enable
sudo ufw status
```

---

## Step 9: Update app.py for Production

The app should not run with `debug=True` in production. Update the last line:

```python
if __name__ == '__main__':
    print("Starting Auction Search GUI...")
    print("Open http://localhost:5001 in your browser")
    # Don't use debug mode in production
    app.run(host='127.0.0.1', port=5001, debug=False)
```

---

## Step 10: Test Deployment

Visit your EC2 public IP or domain in a browser:
```
http://your-ec2-public-ip
```

You should see the Fusca Pro Lookup application!

---

## Useful Commands for Management

```bash
# View application logs
sudo journalctl -u fusca -f

# Restart application
sudo systemctl restart fusca

# Check application status
sudo systemctl status fusca

# Restart Nginx
sudo systemctl restart nginx

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Optional: SSL Certificate (Free with Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Certificate will auto-renew
```

---

## Cost Estimate

- **t2.micro EC2 instance**: Free tier (750 hours/month) or ~$8.50/month
- **Data transfer**: First 100GB free, then $0.09/GB
- **EBS storage**: $0.10/GB-month (10GB = ~$1/month)

**Total**: Free tier eligible, or ~$10-15/month after free tier

---

## Security Recommendations

1. **Use SSH keys only** - Disable password authentication
2. **Restrict Security Group** - Only allow your IP for SSH
3. **Keep system updated**: `sudo apt update && sudo apt upgrade` regularly
4. **Use SSL certificate** - Free with Let's Encrypt
5. **Set up CloudWatch** - Monitor server health and set up alarms
6. **Regular backups** - Use EC2 snapshots or backup scripts
7. **Environment variables** - Never commit credentials to git

---

## Troubleshooting

**Issue: App won't start**
```bash
sudo journalctl -u fusca -n 50
```

**Issue: Database connection fails**
- Check security group allows SSH tunnel
- Verify SSH key permissions: `chmod 600 /path/to/key`
- Check environment variables: `sudo cat /etc/fusca-env.conf`

**Issue: Static files not loading**
- Check Nginx configuration
- Verify file permissions: `sudo chown -R ubuntu:ubuntu /var/www/fusca`

---

## Alternative: Quick Deploy with Docker (Optional)

If you prefer Docker, I can create a Dockerfile and docker-compose.yml for even easier deployment.

