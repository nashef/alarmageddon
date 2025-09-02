import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

// Simple ping command for testing
const PING_COMMAND = {
  name: 'ping',
  description: 'Test if the bot is responsive',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Webhook test command
const WEBHOOK_COMMAND = {
  name: 'webhook',
  description: 'Webhook testing utilities',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      name: 'test',
      description: 'Send a test webhook to the bot',
      type: 1, // SUB_COMMAND
    },
  ],
};

// Alert management command
const ALERT_COMMAND = {
  name: 'alert',
  description: 'Alert management commands',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      name: 'list',
      description: 'Show recent alerts',
      type: 1, // SUB_COMMAND
    },
    {
      name: 'ack',
      description: 'Acknowledge alerts matching a pattern (default: all)',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'pattern',
          description: 'Regex pattern to match alerts (e.g., "critical", "disk.*", ".*") - default: .* (all)',
          type: 3, // STRING
          required: false
        }
      ]
    },
  ],
};

const ALL_COMMANDS = [PING_COMMAND, WEBHOOK_COMMAND, ALERT_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS)
  .then(commands => {
    console.log('✅ Commands registered successfully:');
    commands.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
      if (cmd.options) {
        cmd.options.forEach(opt => {
          console.log(`    - ${opt.name}: ${opt.description}`);
        });
      }
    });
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Failed to register commands:', err);
    process.exit(1);
  });