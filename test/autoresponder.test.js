const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidTrigger, parseCommand, parseAddPayload } = require('../src/autoresponder');

test('parses autoresponder add, remove, and list commands', () => {
  assert.deepEqual(parseCommand('!autoresponder add hello | Hi there!', '!'), {
    action: 'add',
    payload: 'hello | Hi there!',
  });
  assert.deepEqual(parseCommand('!autoresponder remove hello', '!'), {
    action: 'remove',
    payload: 'hello',
  });
  assert.deepEqual(parseCommand('!autoresponder list', '!'), {
    action: 'list',
    payload: '',
  });
  assert.equal(parseCommand('!autoresponder list', '?'), null);
});

test('splits trigger from response at the first separator', () => {
  assert.deepEqual(parseAddPayload('hello | Hi | there!'), {
    trigger: 'hello',
    response: 'Hi | there!',
  });
  assert.equal(parseAddPayload('hello without response'), null);
  assert.equal(parseAddPayload(' | empty trigger'), null);
  assert.equal(parseAddPayload('hello | '), null);
});

test('limits triggers to 100 characters', () => {
  assert.equal(isValidTrigger('hello there'), true);
  assert.equal(isValidTrigger(' '.repeat(2)), false);
  assert.equal(isValidTrigger('a'.repeat(101)), false);
});