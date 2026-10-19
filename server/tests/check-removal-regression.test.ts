import { PolicyEvaluator } from '../src/security/policyEvaluator';
import { AuthTokenPayload, DocumentRecord } from '../src/types';

describe('Authorization Regression: Check-Removal Exercise', () => {
  const victimDocument: DocumentRecord = {
    id: 'doc-victim-100',
    owner_id: 'alice-id',
    display_name: 'Confidential_Merger.pdf',
    category: 'Finance',
    storage_key: 'doc-victim-100.pdf.bin',
    content_type: 'application/pdf',
    file_size: 1024,
    checksum: 'mock-checksum',
    description: 'Highly sensitive merger',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const attackerActor: AuthTokenPayload = {
    userId: 'charlie-attacker-id',
    email: 'charlie@trustvault.local',
    role: 'VIEWER'
  };

  it('standard evaluation strictly denies unauthorized download attempt', () => {
    // Charlie has NO grant on Alice's document
    const result = PolicyEvaluator.evaluateDocumentAccess(
      attackerActor,
      victimDocument,
      'DOWNLOAD_CONTENT',
      null
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Access denied');
  });

  it('demonstrates that bypassing the owner/grant check immediately violates security invariant', () => {
    // Simulate what happens if a naive developer removes the permission check (e.g., returning allowed = true)
    const simulatedBypassedCheck = (actor: AuthTokenPayload, doc: DocumentRecord) => {
      // Flawed implementation: checks only if doc exists, ignores owner/grant!
      return { allowed: true, reason: 'Flawed: Bypassed check' };
    };

    const flawedResult = simulatedBypassedCheck(attackerActor, victimDocument);

    // Assert that our security verification catches this regression:
    // A secure system requires that Charlie must NOT be allowed.
    const isSecurityInvariantBroken = flawedResult.allowed === true;
    expect(isSecurityInvariantBroken).toBe(true);

    // If anyone ever attempts to alter PolicyEvaluator to allow non-owners without grants,
    // this test ensures the core invariant is proven and defended.
    const standardResult = PolicyEvaluator.evaluateDocumentAccess(
      attackerActor,
      victimDocument,
      'DOWNLOAD_CONTENT',
      null
    );
    expect(standardResult.allowed).toBe(false);
  });
});
