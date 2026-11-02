import { isValidHost, parsePingOutput } from './ping';
import { buildInterfaces, operStatus } from './snmp';

describe('Analyse de la sortie ping', () => {
  it('Linux (iputils)', () => {
    const out = '64 bytes from 10.0.0.1: icmp_seq=1 ttl=64 time=0.412 ms';
    expect(parsePingOutput(out)).toEqual({ alive: true, latencyMs: 0.41 });
  });
  it('Windows en français', () => {
    const out = 'Réponse de 10.0.0.1 : octets=32 temps=12 ms TTL=128';
    expect(parsePingOutput(out)).toEqual({ alive: true, latencyMs: 12 });
  });
  it('Windows « temps<1ms »', () => {
    expect(parsePingOutput('Reply from 10.0.0.1: bytes=32 time<1ms TTL=64').alive).toBe(true);
  });
  it("Windows : « Impossible de joindre l'hôte » = injoignable malgré le code retour 0", () => {
    expect(parsePingOutput("Réponse de 10.0.0.254 : Impossible de joindre l'hôte de destination.")).toEqual({ alive: false, latencyMs: null });
  });
  it('refuse les noms d’hôte dangereux', () => {
    expect(isValidHost('10.0.0.1')).toBe(true);
    expect(isValidHost('srv-web.pme.local')).toBe(true);
    expect(isValidHost('1.1.1.1; rm -rf /')).toBe(false);
    expect(isValidHost('-c 1000')).toBe(false);
  });
});

describe('SNMP', () => {
  it('traduit ifOperStatus', () => {
    expect(operStatus(1)).toBe('up');
    expect(operStatus(2)).toBe('down');
    expect(operStatus(7)).toBe('down');
    expect(operStatus(5)).toBe('other');
  });
  it('assemble les colonnes de ifTable et ignore les loopbacks', () => {
    const list = buildInterfaces(
      new Map([[1, 'lo'], [2, 'eth0'], [3, 'GigabitEthernet0/1']]),
      new Map([[1, 1], [2, 1], [3, 2]]),
      new Map([[1, 1], [2, 1], [3, 2]]),
    );
    expect(list).toEqual([
      { index: 2, name: 'eth0', adminUp: true, status: 'up' },
      { index: 3, name: 'GigabitEthernet0/1', adminUp: false, status: 'down' },
    ]);
  });
});
