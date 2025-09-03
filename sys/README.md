# Alarmageddon System Deployment

This directory contains files for deploying Alarmageddon on a Linux system using systemd.

## Files

- `deploy.sh` - Deployment script that sets up the service
- `alarmageddon.service` - Systemd unit file
- `setup-firewall.sh` - Optional firewall configuration script

## Deployment Instructions

### 1. Initial Setup on GCE VM

```bash
# SSH to your GCE instance
ssh user@YOUR_GCE_IP

# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Clone the repository
git clone https://github.com/yourusername/alarmageddon.git
cd alarmageddon

# Run deployment script as root
sudo ./sys/deploy.sh
```

### 2. Configure the Bot

Edit the environment file with your Discord credentials:

```bash
sudo nano /etc/alarmageddon/alarmageddon.env
```

Required configuration:
- `APP_ID` - Your Discord application ID
- `DISCORD_TOKEN` - Your Discord bot token  
- `PUBLIC_KEY` - Your Discord public key
- `DEFAULT_CHANNEL_ID` - Channel ID for default alerts
- `DB_CHANNEL_ID` - Channel ID for database alerts
- `WEBHOOK_TOKEN` - Secret token for webhook authentication
- `WEBHOOK_URL_TOKEN` - Alternative token for URL-based auth

### 3. Register Discord Commands

```bash
cd /opt/alarmageddon
sudo -u alarmageddon npm run register
```

### 4. Start the Service

```bash
# Start the service
sudo systemctl start alarmageddon

# Enable on boot
sudo systemctl enable alarmageddon

# Check status
sudo systemctl status alarmageddon
```

### 5. Configure Firewall (GCE)

In GCE Console or using gcloud CLI:

```bash
# Create firewall rule for the webhook port
gcloud compute firewall-rules create alarmageddon-webhook \
    --allow tcp:31337 \
    --source-ranges 0.0.0.0/0 \
    --target-tags alarmageddon

# Apply tag to your instance
gcloud compute instances add-tags YOUR_INSTANCE_NAME \
    --tags alarmageddon \
    --zone YOUR_ZONE
```

## Service Management

### View Logs
```bash
# Real-time logs
sudo journalctl -u alarmageddon -f

# Last 100 lines
sudo journalctl -u alarmageddon -n 100

# Application log file
sudo tail -f /var/log/alarmageddon/alarmageddon.log
```

### Control Service
```bash
# Start
sudo systemctl start alarmageddon

# Stop
sudo systemctl stop alarmageddon

# Restart
sudo systemctl restart alarmageddon

# Reload configuration
sudo systemctl reload alarmageddon
```

### Update Application
```bash
cd /opt/alarmageddon
sudo systemctl stop alarmageddon
sudo -u alarmageddon git pull
sudo -u alarmageddon npm ci --production
sudo systemctl start alarmageddon
```

## Webhook Configuration

Configure your monitoring systems to send webhooks to:

```
http://YOUR_GCE_EXTERNAL_IP:31337/webhooks/google-alerts
```

Include the authorization header:
```
Authorization: Bearer YOUR_WEBHOOK_TOKEN
```

Or use URL parameter for services that don't support headers:
```
http://YOUR_GCE_EXTERNAL_IP:31337/webhooks/google-alerts?token=YOUR_WEBHOOK_URL_TOKEN
```

## Health Check

Monitor service health at:
```
http://YOUR_GCE_EXTERNAL_IP:31337/health
```

## Troubleshooting

### Service won't start
- Check logs: `sudo journalctl -u alarmageddon -e`
- Verify .env file: `sudo cat /etc/alarmageddon/alarmageddon.env`
- Check permissions: `ls -la /opt/alarmageddon`

### Discord commands not working
- Re-register commands: `cd /opt/alarmageddon && sudo -u alarmageddon npm run register`
- Verify bot token is correct
- Check bot has proper permissions in Discord server

### Webhooks not received
- Check firewall rules: `gcloud compute firewall-rules list`
- Test locally: `curl http://localhost:31337/health`
- Verify webhook token matches

### Database issues
- Check database file: `ls -la /opt/alarmageddon/alarmageddon.db`
- Verify write permissions for alarmageddon user
- Database location is in the app directory, not /var/lib