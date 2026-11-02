import { DeviceContext, evaluate, Probe } from './engine';

const ctx = (over: Partial<DeviceContext> = {}): DeviceContext => ({
  state: 'UP',
  consecutiveFailures: 0,
  uptimeSeconds: null,
  latencyThresholdMs: 100,
  snmpEnabled: true,
  ...over,
});
const ok: Probe = { reachable: true, latencyMs: 5, snmp: { ok: true, uptimeSeconds: 1000, interfaces: [] } };
const ko: Probe = { reachable: false, latencyMs: null };

describe('Moteur d’alertes', () => {
  it('équipement sain : UP, aucune alerte', () => {
    expect(evaluate(ctx(), ok, [])).toEqual({ state: 'UP', consecutiveFailures: 0, open: [], resolve: [] });
  });

  it('un seul échec ne déclenche rien (anti-faux positif)', () => {
    const r = evaluate(ctx(), ko, []);
    expect(r).toEqual({ state: 'UP', consecutiveFailures: 1, open: [], resolve: [] });
  });

  it('deux échecs consécutifs : DOWN + alerte critique', () => {
    const r = evaluate(ctx({ consecutiveFailures: 1 }), ko, []);
    expect(r.state).toBe('DOWN');
    expect(r.open).toEqual([expect.objectContaining({ type: 'DEVICE_DOWN', severity: 'CRITICAL' })]);
  });

  it("n'ouvre pas deux fois la même alerte", () => {
    const r = evaluate(ctx({ consecutiveFailures: 5, state: 'DOWN' }), ko, ['DEVICE_DOWN']);
    expect(r.open).toEqual([]);
    expect(r.resolve).toEqual([]);
  });

  it('retour à la normale : alerte clôturée', () => {
    const r = evaluate(ctx({ consecutiveFailures: 3, state: 'DOWN' }), ok, ['DEVICE_DOWN']);
    expect(r).toMatchObject({ state: 'UP', consecutiveFailures: 0, resolve: ['DEVICE_DOWN'] });
  });

  it('latence au-dessus du seuil : DEGRADED', () => {
    const r = evaluate(ctx(), { ...ok, latencyMs: 250 }, []);
    expect(r.state).toBe('DEGRADED');
    expect(r.open[0].type).toBe('HIGH_LATENCY');
  });

  it('SNMP muet alors que le ping répond', () => {
    const r = evaluate(ctx(), { reachable: true, latencyMs: 3, snmp: { ok: false } }, []);
    expect(r.open.map((a) => a.type)).toEqual(['SNMP_UNREACHABLE']);
    expect(evaluate(ctx({ snmpEnabled: false }), { reachable: true, latencyMs: 3 }, []).open).toEqual([]);
  });

  it('interface activée mais tombée = alerte ; interface désactivée = normal', () => {
    const probe: Probe = {
      reachable: true,
      latencyMs: 2,
      snmp: {
        ok: true,
        interfaces: [
          { index: 1, name: 'Gi0/1', adminUp: true, status: 'down' },
          { index: 2, name: 'Gi0/2', adminUp: false, status: 'down' },
          { index: 3, name: 'Gi0/3', adminUp: true, status: 'up' },
        ],
      },
    };
    const r = evaluate(ctx(), probe, []);
    expect(r.open).toHaveLength(1);
    expect(r.open[0].message).toContain('Gi0/1');
    expect(r.open[0].message).not.toContain('Gi0/2');
  });

  it('redémarrage détecté par la baisse de l’uptime (événement ponctuel)', () => {
    const r = evaluate(ctx({ uptimeSeconds: 50_000 }), ok, []);
    expect(r.open).toEqual([expect.objectContaining({ type: 'REBOOT', instant: true })]);
    expect(r.state).toBe('UP'); // une info ne dégrade pas l'état
  });

  it('seuil DOWN configurable', () => {
    expect(evaluate(ctx(), ko, [], 1).state).toBe('DOWN');
    expect(evaluate(ctx({ consecutiveFailures: 1 }), ko, [], 3).state).toBe('UP');
  });
});
