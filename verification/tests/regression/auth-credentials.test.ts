import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStoredAccount,
  hashPassword,
  isBootstrapAdminCredential,
  parseBootstrapAccounts,
  resolveLoginMode,
  verifyPassword,
} from '../../../lib/server/auth-helpers';

// GH-ISSUE: 2,45,173,202,206,215; GH-PR: 157,192,216

test('parseBootstrapAccounts supports legacy password:name entries', () => {
  const accounts = parseBootstrapAccounts(
    'pass1:张三:admin,pass2:李四:viewer:iptv_access|danmaku_api',
  );

  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].username, 'user-1');
  assert.equal(accounts[0].name, '张三');
  assert.equal(accounts[0].role, 'admin');
  assert.deepEqual(accounts[1].customPermissions, ['iptv_access', 'danmaku_api']);
});

test('parseBootstrapAccounts deduplicates explicit usernames', () => {
  const accounts = parseBootstrapAccounts('alice:p1:Alice,bob:p2:Bob,alice:p3:Clone');

  assert.equal(accounts.length, 3);
  assert.equal(accounts[0].username, 'alice');
  assert.equal(accounts[1].username, 'bob');
  assert.equal(accounts[2].username, 'alice-2');
});

test('hashPassword and verifyPassword round-trip correctly', async () => {
  const password = await hashPassword('secret-123');

  assert.ok(password.hash);
  assert.ok(password.salt);
  assert.equal(await verifyPassword('secret-123', password.salt, password.hash), true);
  assert.equal(await verifyPassword('wrong-password', password.salt, password.hash), false);
});

test('bootstrap admin credential only accepts the configured password', () => {
  assert.equal(isBootstrapAdminCredential('ADMIN', 'current-secret', 'current-secret'), true);
  assert.equal(isBootstrapAdminCredential('admin', 'old-secret', 'current-secret'), false);
  assert.equal(isBootstrapAdminCredential('viewer', 'current-secret', 'current-secret'), false);
  assert.equal(isBootstrapAdminCredential('admin', '', ''), false);
});

test('createStoredAccount hashes passwords and normalizes permissions', async () => {
  const account = await createStoredAccount({
    username: 'alice',
    password: 'secret',
    name: 'Alice',
    role: 'viewer',
    customPermissions: ['iptv_access', 'iptv_builtin_sources'],
  });

  assert.equal(account.username, 'alice');
  assert.notEqual(account.passwordHash, 'secret');
  assert.equal(await verifyPassword('secret', account.passwordSalt, account.passwordHash), true);
});

test('MANAGED_AUTH_ENABLED cannot bypass hard dependencies', () => {
  assert.equal(resolveLoginMode({
    managedAccountCount: 0,
    managedAuthEnabled: false,
    managedAuthForced: true,
    legacyAuthConfigured: true,
  }), 'legacy_password');

  assert.equal(resolveLoginMode({
    managedAccountCount: 0,
    managedAuthEnabled: true,
    managedAuthForced: true,
    legacyAuthConfigured: true,
  }), 'managed');
});
