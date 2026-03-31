#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const { getAgent, getAllAgents } = require('../src/agents');
const { sendMessage } = require('../src/api');
const { printWelcome, runChatSession, createReadlineInterface } = require('../src/chat');

program
  .name('asgard')
  .description('Copilot CLI plugin — chat with the gods of Asgard')
  .version('1.0.0');

// ── chat command ────────────────────────────────────────────────────────────
program
  .command('chat')
  .description('Start an interactive chat session with an Asgardian agent')
  .option('-m, --mode <mode>', 'Agent mode to use (odin|thor|loki|freya|heimdall)', 'odin')
  .action(async (options) => {
    let agent;
    try {
      agent = getAgent(options.mode);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }

    printWelcome(agent, process.stdout);

    const rl = createReadlineInterface(process.stdin, process.stdout);
    await runChatSession(agent, sendMessage, rl, process.stdout);
  });

// ── ask command (single-turn) ───────────────────────────────────────────────
program
  .command('ask <question>')
  .description('Ask a single question and get an immediate answer')
  .option('-m, --mode <mode>', 'Agent mode to use (odin|thor|loki|freya|heimdall)', 'odin')
  .action(async (question, options) => {
    let agent;
    try {
      agent = getAgent(options.mode);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }

    const messages = [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: question },
    ];

    try {
      const reply = await sendMessage(messages);
      console.log(`\n[${agent.name}]: ${reply}\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ── list command ────────────────────────────────────────────────────────────
program
  .command('list')
  .description('List all available agent modes')
  .action(() => {
    const agents = getAllAgents();
    console.log('\nAvailable Asgardian agents:\n');
    for (const [key, agent] of Object.entries(agents)) {
      console.log(`  ${key.padEnd(12)} ${agent.name}, ${agent.title}`);
      console.log(`               ${agent.description}`);
      console.log();
    }
  });

program.parse(process.argv);
