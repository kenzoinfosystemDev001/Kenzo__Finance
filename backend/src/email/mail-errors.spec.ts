import { describeMailFailure } from './mail-errors';

describe('describeMailFailure', () => {
  it('maps connection problems to an unreachable message without server text', () => {
    const failure = describeMailFailure({ code: 'ETIMEDOUT', message: 'connect to smtp.internal:587 password=abc' });
    expect(failure.code).toBe('UNREACHABLE');
    expect(failure.message).not.toMatch(/password|smtp\.internal/);
  });

  it('maps authentication failures to an administrator instruction', () => {
    const failure = describeMailFailure({ code: 'EAUTH', response: '535 secret detail' });
    expect(failure.code).toBe('EAUTH');
    expect(failure.message).toMatch(/SMTP user and password/);
    expect(failure.message).not.toMatch(/secret detail/);
  });

  it('describes a rejected recipient', () => {
    expect(describeMailFailure({ code: 'REJECTED_RECIPIENT' }).message).toMatch(/recipient address/);
  });

  it('separates permanent and temporary SMTP refusals', () => {
    expect(describeMailFailure({ responseCode: 550 }).message).toMatch(/refused the message \(code 550\)/);
    expect(describeMailFailure({ responseCode: 421 }).message).toMatch(/busy or temporarily/);
  });

  it('falls back to a generic message for anything unknown', () => {
    expect(describeMailFailure(new Error('boom')).message).toMatch(/could not be sent/);
    expect(describeMailFailure(undefined).code).toBe('UNKNOWN');
  });
});
