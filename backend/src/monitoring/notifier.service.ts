import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ICON: Record<string, string> = { CRITICAL: '🔴', WARNING: '🟠', INFO: '🔵', RESOLVED: '🟢' };

/** Envoie les alertes vers un webhook Discord / Slack / Teams (format texte compatible) */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger('Alertes');
  private readonly url?: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('ALERT_WEBHOOK_URL') || undefined;
  }

  async notify(level: 'CRITICAL' | 'WARNING' | 'INFO' | 'RESOLVED', device: string, message: string) {
    const text = `${ICON[level]} [${level}] ${device} — ${message}`;
    this.logger.log(text);
    if (!this.url) return;
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, content: text }), // Slack/Teams lisent "text", Discord "content"
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) this.logger.warn(`Webhook : HTTP ${res.status}`);
    } catch (e) {
      this.logger.warn(`Webhook injoignable : ${(e as Error).message}`);
    }
  }
}
