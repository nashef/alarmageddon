#!/bin/bash
set -e

# Alarmageddon deployment script for systemd-based systems
# Run as root or with sudo

REPO_URL="https://github.com/yourusername/alarmageddon.git"  # TODO: Update with actual repo URL
SERVICE_USER="alarmageddon"
SERVICE_GROUP="alarmageddon"
APP_DIR="/opt/alarmageddon"
LOG_DIR="/var/log/alarmageddon"
CONFIG_DIR="/etc/alarmageddon"
ENV_FILE="$CONFIG_DIR/alarmageddon.env"

echo "🚀 Starting Alarmageddon deployment..."

# Create service user if it doesn't exist
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "Creating service user: $SERVICE_USER"
    useradd --system --shell /bin/false --home-dir /nonexistent --create-home $SERVICE_USER
fi

# Create required directories
echo "Creating directories..."
mkdir -p $APP_DIR
mkdir -p $LOG_DIR
mkdir -p $CONFIG_DIR

# Set proper ownership
chown $SERVICE_USER:$SERVICE_GROUP $APP_DIR
chown $SERVICE_USER:$SERVICE_GROUP $LOG_DIR
chown $SERVICE_USER:$SERVICE_GROUP $CONFIG_DIR

# Clone or update repository
if [ -d "$APP_DIR/.git" ]; then
    echo "Updating existing repository..."
    cd $APP_DIR
    sudo -u $SERVICE_USER git pull
else
    echo "Cloning repository..."
    sudo -u $SERVICE_USER git clone $REPO_URL $APP_DIR
    cd $APP_DIR
fi

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
sudo -u $SERVICE_USER npm ci --production

# Create environment file if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating environment file template..."
    cat > $ENV_FILE << 'EOF'
# Discord Configuration
APP_ID=your_discord_app_id
DISCORD_TOKEN=your_discord_bot_token
PUBLIC_KEY=your_discord_public_key

# Channel Configuration
DEFAULT_CHANNEL_ID=your_default_channel_id
DB_CHANNEL_ID=your_database_channel_id

# Security Tokens
WEBHOOK_TOKEN=your_webhook_bearer_token
WEBHOOK_URL_TOKEN=your_webhook_url_token

# Application Settings
PORT=31337
LOG_LEVEL=info
NODE_ENV=production

# Database Settings
RETENTION_DAYS=30

# Logging
AMGN_LOGFILE=/var/log/alarmageddon/alarmageddon.log
EOF
    
    chmod 600 $ENV_FILE
    chown $SERVICE_USER:$SERVICE_GROUP $ENV_FILE
    
    echo ""
    echo "⚠️  IMPORTANT: Edit $ENV_FILE with your actual configuration values"
    echo ""
fi

# Copy systemd service file
echo "Installing systemd service..."
cp $APP_DIR/sys/alarmageddon.service /etc/systemd/system/
systemctl daemon-reload

# Create log rotation config
echo "Setting up log rotation..."
cat > /etc/logrotate.d/alarmageddon << 'EOF'
/var/log/alarmageddon/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 640 alarmageddon alarmageddon
    sharedscripts
    postrotate
        systemctl reload alarmageddon >/dev/null 2>&1 || true
    endscript
}
EOF

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Edit configuration: nano $ENV_FILE"
echo "2. Register Discord commands: cd $APP_DIR && sudo -u $SERVICE_USER npm run register"
echo "3. Start service: systemctl start alarmageddon"
echo "4. Enable on boot: systemctl enable alarmageddon"
echo "5. Check status: systemctl status alarmageddon"
echo "6. View logs: journalctl -u alarmageddon -f"
echo ""
echo "Service endpoints:"
echo "  Webhook: http://$(hostname -I | awk '{print $1}'):31337/webhooks/google-alerts"
echo "  Health:  http://$(hostname -I | awk '{print $1}'):31337/health"