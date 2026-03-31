'use strict';

const { formatAgentMessage, formatPrompt, buildMessages, printWelcome, runChatSession } = require('../src/chat');
const { EventEmitter } = require('events');

// Minimal mock for readline.Interface
class MockReadline extends EventEmitter {
  constructor() {
    super();
    this.closed = false;
  }
  close() {
    this.closed = true;
    this.emit('close');
  }
}

// Minimal writable stream mock
function makeOutput() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(chunk);
    },
    get text() {
      return chunks.join('');
    },
  };
}

const sampleAgent = {
  name: 'TestAgent',
  title: 'Test Title',
  description: 'A test agent.',
  systemPrompt: 'You are a test agent.',
  greeting: 'Hello tester!',
  farewell: 'Goodbye tester!',
};

describe('chat module', () => {
  describe('formatAgentMessage()', () => {
    it('wraps message with agent name', () => {
      expect(formatAgentMessage('Odin', 'Hello!')).toBe('\n[Odin]: Hello!\n');
    });
  });

  describe('formatPrompt()', () => {
    it('formats a prompt with the agent name', () => {
      expect(formatPrompt('Thor')).toBe('You → Thor: ');
    });
  });

  describe('buildMessages()', () => {
    it('prepends system prompt and appends user input', () => {
      const messages = buildMessages('sys', [], 'hello');
      expect(messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ]);
    });

    it('includes conversation history between system and user', () => {
      const history = [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'response' },
      ];
      const messages = buildMessages('sys', history, 'second');
      expect(messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'response' },
        { role: 'user', content: 'second' },
      ]);
    });
  });

  describe('printWelcome()', () => {
    it('writes agent name and greeting to output', () => {
      const output = makeOutput();
      printWelcome(sampleAgent, output);
      expect(output.text).toContain('TestAgent');
      expect(output.text).toContain('Test Title');
      expect(output.text).toContain('Hello tester!');
    });
  });

  describe('runChatSession()', () => {
    it('shows farewell and closes on "exit" input', async () => {
      const output = makeOutput();
      const rl = new MockReadline();
      const sendMessage = jest.fn();

      const sessionPromise = runChatSession(sampleAgent, sendMessage, rl, output);

      rl.emit('line', 'exit');
      await sessionPromise;

      expect(output.text).toContain('Goodbye tester!');
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('shows farewell and closes on "quit" input', async () => {
      const output = makeOutput();
      const rl = new MockReadline();
      const sendMessage = jest.fn();

      const sessionPromise = runChatSession(sampleAgent, sendMessage, rl, output);

      rl.emit('line', 'quit');
      await sessionPromise;

      expect(output.text).toContain('Goodbye tester!');
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('calls sendMessage with correct messages and shows reply', async () => {
      const output = makeOutput();
      const rl = new MockReadline();
      const sendMessage = jest.fn().mockResolvedValue('The oracle speaks.');

      const sessionPromise = runChatSession(sampleAgent, sendMessage, rl, output);

      rl.emit('line', 'Hello agent');
      // Let the async handler run
      await new Promise((r) => setImmediate(r));

      rl.emit('line', 'exit');
      await sessionPromise;

      expect(sendMessage).toHaveBeenCalledWith([
        { role: 'system', content: 'You are a test agent.' },
        { role: 'user', content: 'Hello agent' },
      ]);
      expect(output.text).toContain('The oracle speaks.');
    });

    it('sends history on subsequent turns', async () => {
      const output = makeOutput();
      const rl = new MockReadline();
      const sendMessage = jest.fn().mockResolvedValue('Reply');

      const sessionPromise = runChatSession(sampleAgent, sendMessage, rl, output);

      rl.emit('line', 'first message');
      await new Promise((r) => setImmediate(r));

      rl.emit('line', 'second message');
      await new Promise((r) => setImmediate(r));

      rl.emit('line', 'exit');
      await sessionPromise;

      // Second call should include history from first turn
      const secondCallMessages = sendMessage.mock.calls[1][0];
      expect(secondCallMessages).toEqual([
        { role: 'system', content: 'You are a test agent.' },
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'Reply' },
        { role: 'user', content: 'second message' },
      ]);
    });

    it('shows error message when sendMessage rejects', async () => {
      const output = makeOutput();
      const rl = new MockReadline();
      const sendMessage = jest.fn().mockRejectedValue(new Error('API down'));

      const sessionPromise = runChatSession(sampleAgent, sendMessage, rl, output);

      rl.emit('line', 'hello');
      await new Promise((r) => setImmediate(r));

      rl.emit('line', 'exit');
      await sessionPromise;

      expect(output.text).toContain('[Error]: API down');
    });

    it('ignores blank lines', async () => {
      const output = makeOutput();
      const rl = new MockReadline();
      const sendMessage = jest.fn();

      const sessionPromise = runChatSession(sampleAgent, sendMessage, rl, output);

      rl.emit('line', '   ');
      rl.emit('line', 'exit');
      await sessionPromise;

      expect(sendMessage).not.toHaveBeenCalled();
    });
  });
});
