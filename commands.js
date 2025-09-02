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

const ALL_COMMANDS = [PING_COMMAND, WEBHOOK_COMMAND];

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