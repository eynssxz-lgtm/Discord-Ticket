const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PREFIX, isValidPrefix, parseCommand } = require('../src/prefix');

test('default prefix is !', () => {
  assert.equal(DEFAULT_PREFIX, '!');
});

test('accepts prefixes from one to five non-whitespace characters', () => {
  assert.equal(isValidPrefix('?'), true);
  assert.equal(isValidPrefix('ticket'), false);
  assert.equal(isValidPrefix('two words'), false);
  assert.equal(isValidPrefix(''), false);
});

test('parses command names and arguments after the configured prefix', () => {
  assert.deepEqual(parseCommand('?setprefix !!', '?'), {
    name: 'setprefix',
    args: ['!!'],
  });
  assert.deepEqual(parseCommand('!set prefix ?', '!'), {
    name: 'setprefix',
    args: ['?'],
  });
  assert.deepEqual(parseCommand('!set logs #mod-logs', '!'), {
    name: 'setlogs',
    args: ['#mod-logs'],
  });
  assert.deepEqual(parseCommand('!set temp voice #create-room', '!'), {
    name: 'settempvoice',
    args: ['#create-room'],
  });
  assert.deepEqual(parseCommand('!settempvoice off', '!'), {
    name: 'settempvoice',
    args: ['off'],
  });
  assert.equal(parseCommand('!setprefix ?', '?'), null);
});