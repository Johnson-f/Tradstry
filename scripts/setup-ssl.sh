#!/bin/bash

# SSL Certificate Setup Script for Tradistry
# This script sets up Let's Encrypt SSL certificates

set -e

echo "🔒 Setting up SSL certificates for tradstry.com..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run this script as root or with sudo"
    exit 1
fi

# Check if domain is pointing to this server
echo "🌐 Checking DNS configuration..."
DOMAIN_IP=$(dig +short tradstry.com)
SERVER_IP=$(curl -s ifconfig.me)

if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
    echo "⚠️  Warning: Domain tradstry.com ($DOMAIN_IP) is not pointing to this server ($SERVER_IP)"
    echo "   Please update your DNS settings first!"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing Certbot..."
    apt update
    apt install -y certbot python3-certbot-nginx
fi

# Create webroot directory
mkdir -p /var/www/certbot

# Stop nginx temporarily
echo "🛑 Stopping nginx..."
docker-compose stop nginx || true

# Obtain SSL certificate
echo "🔐 Obtaining SSL certificate..."
certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email admin@tradstry.com \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d tradstry.com \
    -d www.tradstry.com

# Copy certificates to nginx directory
echo "📋 Copying certificates..."
mkdir -p nginx/ssl
cp /etc/letsencrypt/live/tradstry.com/fullchain.pem nginx/ssl/tradstry.com.crt
cp /etc/letsencrypt/live/tradstry.com/privkey.pem nginx/ssl/tradstry.com.key

# Set proper permissions
chmod 644 nginx/ssl/tradstry.com.crt
chmod 600 nginx/ssl/tradstry.com.key

# Start nginx
echo "▶️ Starting nginx..."
docker-compose up -d nginx

# Test SSL
echo "🧪 Testing SSL configuration..."
sleep 10
if curl -s -o /dev/null -w "%{http_code}" https://tradstry.com | grep -q "200\|301\|302"; then
    echo "✅ SSL is working correctly!"
else
    echo "⚠️  SSL test failed. Please check the configuration."
fi

# Set up auto-renewal
echo "🔄 Setting up certificate auto-renewal..."
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'cd /opt/tradstry && docker-compose restart nginx'") | crontab -

echo ""
echo "🎉 SSL setup complete!"
echo ""
echo "✅ Your site is now available at:"
echo "   🌐 https://tradstry.com"
echo "   🌐 https://www.tradstry.com"
echo ""
echo "📋 Certificate details:"
echo "   📅 Expires: $(openssl x509 -in nginx/ssl/tradstry.com.crt -noout -dates | grep notAfter | cut -d= -f2)"
echo "   🔄 Auto-renewal: Enabled (runs daily at 12:00)"
echo ""
echo "🔍 To check certificate status: certbot certificates"
echo "🔄 To manually renew: certbot renew"
