// Déclarations minimales pour la bibliothèque net-snmp (pas de types officiels)
declare module 'net-snmp' {
  export interface Varbind {
    oid: string;
    type: number;
    value: unknown;
  }
  export interface SessionOptions {
    port?: number;
    retries?: number;
    timeout?: number;
    version?: number;
  }
  export interface Session {
    get(oids: string[], cb: (error: Error | null, varbinds: Varbind[]) => void): void;
    subtree(
      oid: string,
      maxRepetitions: number,
      feedCb: (varbinds: Varbind[]) => boolean | void,
      doneCb: (error: Error | null) => void,
    ): void;
    close(): void;
    on(event: 'error', cb: (err: Error) => void): void;
  }
  export const Version1: number;
  export const Version2c: number;
  export function createSession(target: string, community: string, options?: SessionOptions): Session;
  export function isVarbindError(vb: Varbind): boolean;
  export function varbindError(vb: Varbind): string;
}
