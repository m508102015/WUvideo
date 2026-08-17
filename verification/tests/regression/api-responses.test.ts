import test from 'node:test';
import assert from 'node:assert/strict';

import { authenticationRequiredResponse } from '../../../lib/server/api-responses';

// GH-ISSUE: 204,226; GH-PR: 227

test('authenticationRequiredResponse returns a 401 JSON response', async () => {
  const response = authenticationRequiredResponse();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});
