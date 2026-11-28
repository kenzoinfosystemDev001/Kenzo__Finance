import { clientIp } from './client-ip';

const TOKEN = 'a'.repeat(40);

function request(headers: Record<string, string | string[] | undefined>, ip = '10.0.0.5') {
  return { ip, headers };
}

describe('clientIp', () => {
  it('uses the forwarded address when the proxy token matches', () => {
    const req = request({ 'x-client-ip': '203.0.113.7', 'x-internal-proxy-token': TOKEN });
    expect(clientIp(req, TOKEN)).toBe('203.0.113.7');
  });

  it('accepts IPv6 addresses', () => {
    const req = request({ 'x-client-ip': '2001:db8::1', 'x-internal-proxy-token': TOKEN });
    expect(clientIp(req, TOKEN)).toBe('2001:db8::1');
  });

  it('ignores the forwarded address when the token does not match', () => {
    const req = request({ 'x-client-ip': '203.0.113.7', 'x-internal-proxy-token': 'b'.repeat(40) });
    expect(clientIp(req, TOKEN)).toBe('10.0.0.5');
  });

  it('ignores the forwarded address when the token has a different length', () => {
    const req = request({ 'x-client-ip': '203.0.113.7', 'x-internal-proxy-token': 'short' });
    expect(clientIp(req, TOKEN)).toBe('10.0.0.5');
  });

  it('ignores the forwarded address when the token is missing', () => {
    expect(clientIp(request({ 'x-client-ip': '203.0.113.7' }), TOKEN)).toBe('10.0.0.5');
  });

  it('ignores everything when no token is configured', () => {
    const req = request({ 'x-client-ip': '203.0.113.7', 'x-internal-proxy-token': '' });
    expect(clientIp(req, undefined)).toBe('10.0.0.5');
    expect(clientIp(req, '')).toBe('10.0.0.5');
  });

  it('treats a configured token shorter than 32 characters as unset', () => {
    const short = 'x'.repeat(31);
    const req = request({ 'x-client-ip': '203.0.113.7', 'x-internal-proxy-token': short });
    expect(clientIp(req, short)).toBe('10.0.0.5');
  });

  it.each(['not-an-ip', '203.0.113.7, 198.51.100.1', '999.1.1.1', '', '   ', '1.2.3.4\r\nx: y'])(
    'rejects a malformed forwarded address %j',
    (value) => {
      const req = request({ 'x-client-ip': value, 'x-internal-proxy-token': TOKEN });
      expect(clientIp(req, TOKEN)).toBe('10.0.0.5');
    },
  );

  it('rejects repeated headers', () => {
    const req = request({ 'x-client-ip': ['203.0.113.7', '198.51.100.1'], 'x-internal-proxy-token': TOKEN });
    expect(clientIp(req, TOKEN)).toBe('10.0.0.5');
  });

  it('returns null when nothing is known', () => {
    expect(clientIp({ headers: {} }, TOKEN)).toBeNull();
  });
});
