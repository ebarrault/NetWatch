import { Controller, Global, Injectable, MessageEvent, Module, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import { Public } from '../auth/auth.module';

export type LiveEvent =
  | { kind: 'device'; deviceId: number; state: string; latencyMs: number | null; at: string }
  | { kind: 'alert'; alertId: number; deviceId: number; status: 'opened' | 'resolved' | 'acknowledged'; type: string; message: string; at: string }
  | { kind: 'cycle'; checked: number; durationMs: number; at: string };

/** Bus d'événements interne, diffusé aux navigateurs en Server-Sent Events */
@Injectable()
export class EventsService {
  private readonly subject = new Subject<LiveEvent>();
  readonly stream$ = this.subject.asObservable();
  emit(e: LiveEvent) {
    this.subject.next(e);
  }
}

@ApiTags('events')
@Controller('events')
class EventsController {
  constructor(private events: EventsService, private jwt: JwtService) {}

  /** EventSource ne permet pas d'en-tête Authorization : le jeton passe en paramètre */
  @Public()
  @Sse()
  stream(@Query('token') token: string): Observable<MessageEvent> {
    try {
      this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException();
    }
    const heartbeat = interval(25_000).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent));
    return merge(this.events.stream$.pipe(map((e) => ({ data: e }) as MessageEvent)), heartbeat);
  }
}

@Global()
@Module({ controllers: [EventsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}
