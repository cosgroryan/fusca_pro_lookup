# Quick Start - Deploy to AWS EC2 in 10 Minutes

## Prerequisites
- AWS account
- EC2 instance running Ubuntu 22.04+
- SSH key to access the instance
- Database credentials ready

---

## 3-Step Deployment

### Step 1: Upload Files to EC2

From your local machine:
```bash
# Upload the entire project
scp -i your-key.pem -r /path/to/fusca_pro_loockup ubuntu@YOUR-EC2-IP:~/
```

### Step 2: Configure Environment

SSH into your EC2 instance:
```bash
ssh -i your-key.pem ubuntu@YOUR-EC2-IP
```

Create environment configuration:
```bash
sudo nano /etc/fusca-env.conf
```

Add your credentials (copy from `deployment/env.example`):
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

Save and exit (Ctrl+X, Y, Enter)

### Step 3: Run Deployment Script

```bash
cd ~/fusca_pro_loockup
chmod +x deployment/deploy.sh
./deployment/deploy.sh
```

The script will automatically:
- ✅ Install all dependencies
- ✅ Setup Python virtual environment
- ✅ Configure Nginx
- ✅ Setup systemd service
- ✅ Start the application

---

## Access Your Application

After deployment completes, visit:
```
http://YOUR-EC2-PUBLIC-IP
```

---

## Management Commands

```bash
# View application logs
sudo journalctl -u fusca -f

# Restart application
sudo systemctl restart fusca

# Check status
sudo systemctl status fusca

# View Nginx logs
sudo tail -f /var/log/nginx/fusca_access.log
```

---

## Troubleshooting

**Can't access the site?**
1. Check AWS Security Group allows HTTP (port 80)
2. Check service status: `sudo systemctl status fusca`
3. Check Nginx: `sudo systemctl status nginx`

**Database connection issues?**
1. Verify credentials in `/etc/fusca-env.conf`
2. Check logs: `sudo journalctl -u fusca -n 50`

**Need to update the app?**
```bash
cd ~/fusca_pro_loockup
git pull  # if using git
# or upload new files via scp
sudo systemctl restart fusca
```

---

## Cost

- **t2.micro** (free tier): $0/month for first 12 months
- **After free tier**: ~$10-15/month
- **With domain + SSL**: +$12/year for domain

---

## Next Steps

1. **Add a domain name** - Point your domain to EC2 IP
2. **Setup SSL** - Run: `sudo certbot --nginx -d yourdomain.com`
3. **Enable auto-backups** - Setup EC2 snapshots
4. **Monitor** - Setup CloudWatch alarms

---

That's it! Your application is now live on AWS EC2. 🚀

