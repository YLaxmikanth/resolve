const assert = require('assert');
const { resolveCase } = require('./resolveEngine');

(async () => {
  const scenario1 = await resolveCase('₹4,999 was deducted but my order failed.');
  assert.ok(scenario1.caseId, 'Missing caseId');
  assert.ok(scenario1.intent, 'Missing intent');
  assert.ok(scenario1.investigation, 'Missing investigation');
  assert.ok(scenario1.policy, 'Missing policy');
  assert.ok(scenario1.resolution, 'Missing resolution');
  assert.ok(scenario1.verification, 'Missing verification');
  assert.ok(scenario1.finalStatus, 'Missing finalStatus');
  console.log('Scenario 1 OK:', scenario1.finalStatus, scenario1.resolution.type);

  const scenario2 = await resolveCase('I was charged twice for the same order.');
  console.log('Scenario 2 OK:', scenario2.finalStatus, scenario2.policy.decision);

  const scenario3 = await resolveCase("I don't recognize this transaction.");
  console.log('Scenario 3 OK:', scenario3.finalStatus, scenario3.resolution.type);

  console.log('All backend resolve tests passed.');
})().catch((error) => {
  console.error('Backend tests failed:', error);
  process.exit(1);
});
