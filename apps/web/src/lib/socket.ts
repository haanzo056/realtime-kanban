import { parseServerMessage, type ClientMessage, type ServerMessage } from '@kanban/shared';

export type ConnectionStatus = 'connecting' | 'live' | 'offline';

interface Options {
  url: string;
  token: string;
  boardId: string;
  getRevision: () => number | undefined;
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
  onOpen?: () => void;
  onFatal?: (reason: string) => void;
}

const MAX_BACKOFF_MS = 15_000;

export class BoardConnection {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onOnline = () => this.reconnectNow();

  constructor(private readonly opts: Options) {}

  connect() {
    this.closed = false;
    window.addEventListener('online', this.onOnline);
    this.open();
  }

  close() {
    this.closed = true;
    window.removeEventListener('online', this.onOnline);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close(1000);
    this.ws = null;
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  resync() {
    this.send({ t: 'hello', boardId: this.opts.boardId, sinceRevision: this.opts.getRevision() });
  }

  private open() {
    this.opts.onStatus('connecting');
    const url = `${this.opts.url}/ws?token=${encodeURIComponent(this.opts.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.opts.onStatus('live');
      this.resync();
      this.opts.onOpen?.();
    };

    ws.onmessage = (ev) => {
      const msg = parseServerMessage(typeof ev.data === 'string' ? ev.data : '');
      if (msg) this.opts.onMessage(msg);
    };

    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closed) return;
      // 4xxx codes are ours and mean retrying won't help.
      if (ev.code >= 4000 && ev.code < 5000) {
        this.opts.onStatus('offline');
        this.opts.onFatal?.(ev.reason || 'connection refused');
        return;
      }
      this.opts.onStatus('offline');
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempts);
    // Jitter so a server restart doesn't get every client back in the same tick.
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempts++;
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private reconnectNow() {
    if (this.closed || this.ws) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.attempts = 0;
    this.open();
  }
}
