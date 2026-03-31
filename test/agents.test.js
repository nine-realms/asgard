'use strict';

const { getAgent, getAllAgents, AGENTS } = require('../src/agents');

describe('agents module', () => {
  describe('AGENTS', () => {
    it('defines the expected five agents', () => {
      expect(Object.keys(AGENTS)).toEqual(['odin', 'thor', 'loki', 'freya', 'heimdall']);
    });

    it('each agent has required fields', () => {
      const requiredFields = ['name', 'title', 'description', 'systemPrompt', 'greeting', 'farewell'];
      for (const [key, agent] of Object.entries(AGENTS)) {
        for (const field of requiredFields) {
          expect(agent[field]).toBeTruthy();
          expect(typeof agent[field]).toBe('string');
        }
      }
    });
  });

  describe('getAgent()', () => {
    it('returns the correct agent for a valid lowercase key', () => {
      const agent = getAgent('odin');
      expect(agent.name).toBe('Odin');
    });

    it('is case-insensitive', () => {
      expect(getAgent('THOR').name).toBe('Thor');
      expect(getAgent('Loki').name).toBe('Loki');
      expect(getAgent('FREYA').name).toBe('Freya');
      expect(getAgent('Heimdall').name).toBe('Heimdall');
    });

    it('throws for an unknown mode', () => {
      expect(() => getAgent('baldur')).toThrow(/Unknown agent mode "baldur"/);
      expect(() => getAgent('baldur')).toThrow(/odin, thor, loki, freya, heimdall/);
    });
  });

  describe('getAllAgents()', () => {
    it('returns a copy of all agents', () => {
      const all = getAllAgents();
      expect(Object.keys(all)).toEqual(Object.keys(AGENTS));
    });

    it('returns a shallow copy, not the original object', () => {
      const all = getAllAgents();
      expect(all).not.toBe(AGENTS);
    });
  });
});
