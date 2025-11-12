# Deployment Files for AWS EC2

This folder contains everything you need to deploy Fusca Pro Lookup to AWS EC2.

## 📁 Files Included

- **`QUICKSTART.md`** - 10-minute deployment guide (start here!)
- **`deploy.sh`** - Automated deployment script
- **`fusca.service`** - Systemd service configuration
- **`nginx.conf`** - Nginx reverse proxy configuration
- **`env.example`** - Environment variables template

## 🚀 Quick Deploy

1. **Launch EC2 instance** (Ubuntu 22.04, t2.micro)
2. **Upload files**: `scp -i key.pem -r fusca_pro_loockup ubuntu@EC2-IP:~/`
3. **SSH in**: `ssh -i key.pem ubuntu@EC2-IP`
4. **Configure**: `sudo nano /etc/fusca-env.conf` (use env.example)
5. **Deploy**: `cd fusca_pro_loockup && ./deployment/deploy.sh`

Done! Access at `http://YOUR-EC2-IP`

## 📚 Documentation

- **`QUICKSTART.md`** - Step-by-step deployment
- **`../DEPLOYMENT.md`** - Detailed deployment guide with troubleshooting

## 🔧 Manual Setup

If you prefer manual setup over the automated script:

1. Copy `fusca.service` to `/etc/systemd/system/`
2. Copy `nginx.conf` to `/etc/nginx/sites-available/fusca`
3. Copy `env.example` to `/etc/fusca-env.conf` and fill in credentials
4. Enable services: `sudo systemctl enable fusca nginx`

See full instructions in `DEPLOYMENT.md`.

## 💰 Cost

- **Free tier**: $0/month (t2.micro for 12 months)
- **After free tier**: ~$10-15/month
- **Optional domain**: +$12/year

## 🛡️ Security Checklist

- [ ] Change default SSH port (optional)
- [ ] Restrict SSH to your IP in Security Group
- [ ] Setup SSL with Let's Encrypt
- [ ] Configure firewall: `sudo ufw enable`
- [ ] Keep system updated: `sudo apt update && sudo apt upgrade`
- [ ] Never commit credentials to git

## 🔍 Troubleshooting

**Application won't start?**
```bash
sudo journalctl -u fusca -f
```

**Database connection issues?**
```bash
# Check credentials
sudo cat /etc/fusca-env.conf

# Test SSH tunnel manually
ssh -i /path/to/key user@ssh-host
```

**Static files not loading?**
```bash
# Check permissions
ls -la /var/www/fusca/static/

# Restart Nginx
sudo systemctl restart nginx
```

## 📞 Support

Check the main `DEPLOYMENT.md` for detailed troubleshooting and management commands.

