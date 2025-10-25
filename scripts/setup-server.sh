#!/bin/bash

# Server Setup Script for Hetzner VPS
# Run this script once on your VPS to set up the environment

set -e

echo "🚀 Setting up Hetzner VPS for Tradistry deployment..."

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install essential packages
echo "🔧 Installing essential packages..."
apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group
usermod -aG docker $USER

# Install Docker Compose (standalone)
echo "🔧 Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Nginx
echo "🌐 Installing Nginx..."
apt install -y nginx

# Install Certbot for SSL
echo "🔒 Installing Certbot for SSL certificates..."
apt install -y certbot python3-certbot-nginx

# Configure firewall
echo "🔥 Configuring firewall..."
ufw --force enable
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw reload

# Create application directories
echo "📁 Creating application directories..."
mkdir -p /opt/tradstry/{nginx/ssl,nginx/logs,logs}
mkdir -p /var/www/certbot

# Set up log rotation
echo "📝 Setting up log rotation..."
cat > /etc/logrotate.d/tradstry << EOF
/opt/tradstry/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker-compose -f /opt/tradstry/docker-compose.yaml restart nginx
    endscript
}
EOF

# Create systemd service for auto-start
echo "⚙️ Creating systemd service..."
cat > /etc/systemd/system/tradstry.service << EOF
[Unit]
Description=Tradistry Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/tradstry
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable the service
systemctl daemon-reload
systemctl enable tradstry.service

# Create SSL setup script
echo "🔐 Creating SSL setup script..."
cat > /opt/tradstry/setup-ssl.sh << 'EOF'
#!/bin/bash

# SSL Certificate Setup Script
set -e

echo "🔒 Setting up SSL certificates for tradstry.com..."

# Stop nginx temporarily
docker-compose stop nginx

# Obtain SSL certificate
certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email admin@tradstry.com \
    --agree-tos \
    --no-eff-email \
    -d tradstry.com \
    -d www.tradstry.com

# Copy certificates to nginx directory
cp /etc/letsencrypt/live/tradstry.com/fullchain.pem /opt/tradstry/nginx/ssl/tradstry.com.crt
cp /etc/letsencrypt/live/tradstry.com/privkey.pem /opt/tradstry/nginx/ssl/tradstry.com.key

# Set proper permissions
chmod 644 /opt/tradstry/nginx/ssl/tradstry.com.crt
chmod 600 /opt/tradstry/nginx/ssl/tradstry.com.key

# Start nginx
docker-compose up -d nginx

echo "✅ SSL certificates installed successfully!"

# Set up auto-renewal
echo "🔄 Setting up certificate auto-renewal..."
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'docker-compose -f /opt/tradstry/docker-compose.yaml restart nginx'") | crontab -

echo "🎉 SSL setup complete!"
EOF

chmod +x /opt/tradstry/setup-ssl.sh

echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy your application files to /opt/tradstry/"
echo "2. Copy your environment files (.env.production)"
echo "3. Run: cd /opt/tradstry && ./setup-ssl.sh"
echo "4. Run: docker-compose up -d"
echo ""
echo "Don't forget to configure your DNS to point to this server!"
