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
  assert.strictEqual(scenario1.policy.decision, 'REFUND');
  assert.strictEqual(scenario1.finalStatus, 'RESOLVED');
  console.log('Scenario 1 OK:', scenario1.finalStatus, scenario1.resolution.type);

  const scenario2 = await resolveCase('I was charged twice for the same order.');
  assert.strictEqual(scenario2.policy.decision, 'REFUND_ONE_CHARGE');
  assert.strictEqual(scenario2.finalStatus, 'RESOLVED');
  console.log('Scenario 2 OK:', scenario2.finalStatus, scenario2.policy.decision);

  const scenario3 = await resolveCase("I don't recognize this transaction.");
  assert.strictEqual(scenario3.policy.decision, 'ESCALATE');
  assert.strictEqual(scenario3.finalStatus, 'ESCALATED_TO_HUMAN');
  console.log('Scenario 3 OK:', scenario3.finalStatus, scenario3.resolution.type);

  const scenario4 = await resolveCase('My payment is still pending.');
  assert.strictEqual(scenario4.intent, 'PAYMENT_PENDING');
  assert.strictEqual(scenario4.policy.decision, 'REQUEST_MORE_INFORMATION');
  assert.strictEqual(scenario4.finalStatus, 'IN_PROGRESS');
  console.log('Scenario 4 OK:', scenario4.intent, scenario4.policy.decision, scenario4.finalStatus);

  const scenario5 = await resolveCase('My order never arrived.');
  assert.strictEqual(scenario5.intent, 'ORDER_NOT_RECEIVED');
  assert.strictEqual(scenario5.policy.decision, 'ESCALATE');
  assert.strictEqual(scenario5.finalStatus, 'ESCALATED_TO_HUMAN');
  console.log('Scenario 5 OK:', scenario5.intent, scenario5.policy.decision, scenario5.finalStatus);

  const scenario6 = await resolveCase('I want to cancel my order.');
  assert.strictEqual(scenario6.intent, 'ORDER_CANCELLATION');
  assert.strictEqual(scenario6.policy.decision, 'REQUEST_MORE_INFORMATION');
  assert.strictEqual(scenario6.finalStatus, 'IN_PROGRESS');
  console.log('Scenario 6 OK:', scenario6.intent, scenario6.policy.decision, scenario6.finalStatus);

  const scenario7 = await resolveCase("I don't know what happened to my order.");
  assert.ok(['UNKNOWN_ISSUE', 'GENERAL_SUPPORT'].includes(scenario7.intent));
  assert.strictEqual(scenario7.policy.decision, 'REQUEST_MORE_INFORMATION');
  assert.strictEqual(scenario7.finalStatus, 'IN_PROGRESS');
  console.log('Scenario 7 OK:', scenario7.intent, scenario7.policy.decision, scenario7.finalStatus);

  const scenario8 = await resolveCase("Someone charged my card and I don't recognize it.");
  assert.strictEqual(scenario8.intent, 'SUSPICIOUS_TRANSACTION');
  assert.strictEqual(scenario8.policy.decision, 'ESCALATE');
  assert.strictEqual(scenario8.finalStatus, 'ESCALATED_TO_HUMAN');
  console.log('Scenario 8 OK:', scenario8.intent, scenario8.policy.decision, scenario8.finalStatus);

  console.log('All 8 backend resolve tests passed.');
})().catch((error) => {
  console.error('Backend tests failed:', error);
  process.exit(1);
});
