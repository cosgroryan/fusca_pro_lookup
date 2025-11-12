#!/bin/bash
# Quick deployment script for Fusca Pro Lookup
# Run this on your EC2 instance after uploading the files

set -e  # Exit on error

echo "🚀 Starting Fusca Pro Lookup Deployment..."

# Check if running as ubuntu user
if [ "$USER" != "ubuntu" ]; then
    echo "⚠️  Please run this script as ubuntu user"
    exit 1
fi

# Install system dependencies
echo "📦 Installing system dependencies..."
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nginx

# Setup application directory
APP_DIR="/var/www/fusca"
echo "📁 Setting up application directory: $APP_DIR"
sudo mkdir -p $APP_DIR
sudo chown -R ubuntu:ubuntu $APP_DIR

# Copy files if running from upload directory
if [ "$PWD" != "$APP_DIR" ]; then
    echo "📋 Copying files to $APP_DIR..."
    cp -r * $APP_DIR/
    cd $APP_DIR
fi

# Create virtual environment
echo "🐍 Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
echo "📚 Installing Python packages..."
pip install --upgrade pip
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
pip install gunicorn

# Setup systemd service
echo "⚙️  Setting up systemd service..."
sudo cp deployment/fusca.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fusca

# Setup Nginx
echo "🌐 Configuring Nginx..."
sudo cp deployment/nginx.conf /etc/nginx/sites-available/fusca
sudo ln -sf /etc/nginx/sites-available/fusca /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

# Start services
echo "🎬 Starting services..."
sudo systemctl restart fusca
sudo systemctl restart nginx

# Check status
echo ""
echo "✅ Deployment complete!"
echo ""
echo "Service status:"
sudo systemctl status fusca --no-pager -l
echo ""
echo "🌍 Access your application at: http://$(curl -s ifconfig.me)"
echo ""
echo "📊 Useful commands:"
echo "  - View logs: sudo journalctl -u fusca -f"
echo "  - Restart app: sudo systemctl restart fusca"
echo "  - Check status: sudo systemctl status fusca"

