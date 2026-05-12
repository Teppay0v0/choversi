// ChoVersi オンライン対戦バックエンド
// Cloudflare Workers + Durable Objects
// 役割：プライベートルーム / WebSocket 中継 / 初期手札の配布 / 再接続対応

const FULL_DECK = [
  'kyozo', 'zoshoku', 'hanten',
  'gyakushu', 'muko',
  'hogeki', 'bakudan', 'shoshitsu', 'tanchi',
];
const STRONG_SKILLS = ['bakudan', 'tanchi', 'hogeki'];
const HAND_SIZE_D = 4;
const HAND_SIZE_L = 3;
// 部屋コードは紛らわしい文字を除外
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// プレイヤーが切断した後、何秒以内に再接続すれば opponent_left を出さないか
const RECONNECT_GRACE_MS = 60_000;
// 部屋を放置してから自動破棄するまで（DO は無 WS 状態でも生き続ける）
const ROOM_IDLE_MS = 10 * 60_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function randCode() {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

function shuffle(a) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function dealD() {
  // 4枚、強カードを少なくとも1枚保証
  let deck = shuffle(FULL_DECK);
  let hand = deck.slice(0, HAND_SIZE_D);
  if (!hand.some(s => STRONG_SKILLS.includes(s))) {
    const strongIdx = deck.findIndex((s, i) => i >= HAND_SIZE_D && STRONG_SKILLS.includes(s));
    if (strongIdx >= 0) {
      const swapIdx = Math.floor(Math.random() * HAND_SIZE_D);
      [deck[swapIdx], deck[strongIdx]] = [deck[strongIdx], deck[swapIdx]];
    }
  }
  return deck.slice(0, HAND_SIZE_D);
}

function dealL() {
  return shuffle(FULL_DECK).slice(0, HAND_SIZE_L);
}

// ============================================================
//  Worker entry
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // ルーム作成：6文字の部屋コードを返す
    if (url.pathname === '/api/create' && request.method === 'POST') {
      const code = randCode();
      const id = env.ROOM.idFromName(code);
      const room = env.ROOM.get(id);
      const initRes = await room.fetch(new Request('https://internal/init', { method: 'POST' }));
      if (!initRes.ok) {
        return new Response('Failed to init room', { status: 500, headers: CORS });
      }
      return new Response(JSON.stringify({ code }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // WebSocket 接続：/ws/:code?name=...&pid=...
    if (url.pathname.startsWith('/ws/')) {
      const code = url.pathname.split('/')[2];
      if (!code || code.length !== 6) {
        return new Response('Invalid room code', { status: 400, headers: CORS });
      }
      const id = env.ROOM.idFromName(code);
      const room = env.ROOM.get(id);
      return room.fetch(request);
    }

    // ヘルスチェック
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('ChoVersi server OK', { headers: CORS });
    }

    return new Response('Not Found', { status: 404, headers: CORS });
  }
};

// ============================================================
//  Room Durable Object — 1部屋 = 1 DO
// ============================================================
export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];  // [{pid, ws, color, name, disconnectTimer}]
    this.handD = null;
    this.handL = null;
    this.gameStarted = false;
    this.created = Date.now();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/init') {
      return new Response('OK');
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.handleSession(server, url);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not Found', { status: 404 });
  }

  handleSession(ws, url) {
    ws.accept();

    const pid = (url.searchParams.get('pid') || '').slice(0, 64);
    const name = (url.searchParams.get('name') || 'プレイヤー').slice(0, 20);

    // 既に同じ pid のセッションがあれば再接続として処理
    let session = pid ? this.sessions.find(s => s.pid === pid) : null;

    if (session) {
      // 再接続：旧 ws を閉じて新 ws に置き換え
      if (session.disconnectTimer) {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = null;
      }
      if (session.ws && session.ws !== ws) {
        try { session.ws.close(1000, 'Replaced by reconnect'); } catch (e) {}
      }
      session.ws = ws;
      session.name = name;
      this.sendInitTo(session);
    } else {
      // 新規参加：満員チェック
      if (this.sessions.length >= 2) {
        try {
          ws.send(JSON.stringify({ type: 'error', message: 'この部屋は満員です' }));
          ws.close(1000, 'Room full');
        } catch (e) {}
        return;
      }
      const color = this.sessions.length === 0 ? 'D' : 'L';
      session = { pid: pid || crypto.randomUUID(), ws, color, name, disconnectTimer: null };
      this.sessions.push(session);

      // joined を即送信
      try {
        ws.send(JSON.stringify({
          type: 'joined',
          color: session.color,
          pid: session.pid,
          partnerName: this.sessions.find(s => s !== session)?.name || null,
        }));
      } catch (e) {}

      // 2人揃ったらゲーム開始
      if (this.sessions.length === 2 && !this.gameStarted) {
        this.handD = dealD();
        this.handL = dealL();
        this.gameStarted = true;
        for (const s of this.sessions) {
          this.sendStartTo(s);
        }
      }
    }

    ws.addEventListener('message', evt => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }
      this.handleMessage(session, msg);
    });

    ws.addEventListener('close', () => {
      if (session.ws !== ws) return; // 既に置き換えられている
      session.ws = null;
      // 猶予時間内に再接続が来なければ部屋を閉じる
      session.disconnectTimer = setTimeout(() => {
        this.sessions = this.sessions.filter(s => s !== session);
        for (const s of this.sessions) {
          if (s.ws) {
            try { s.ws.send(JSON.stringify({ type: 'opponent_left' })); } catch (e) {}
          }
        }
      }, RECONNECT_GRACE_MS);
    });

    ws.addEventListener('error', () => {
      // 'close' でハンドルするので何もしない
    });
  }

  sendInitTo(session) {
    if (!session.ws) return;
    try {
      if (this.gameStarted) {
        this.sendStartTo(session);
      } else {
        session.ws.send(JSON.stringify({
          type: 'joined',
          color: session.color,
          pid: session.pid,
          partnerName: this.sessions.find(s => s !== session)?.name || null,
        }));
      }
    } catch (e) {}
  }

  sendStartTo(session) {
    if (!session.ws) return;
    try {
      session.ws.send(JSON.stringify({
        type: 'start',
        color: session.color,
        pid: session.pid,
        myHand: session.color === 'D' ? this.handD : this.handL,
        oppHandSize: session.color === 'D' ? this.handL.length : this.handD.length,
        partnerName: this.sessions.find(s => s !== session)?.name || '相手',
      }));
    } catch (e) {}
  }

  handleMessage(from, msg) {
    const partner = this.sessions.find(s => s !== from);
    if (!partner || !partner.ws) return;

    const allowed = ['move', 'vanish', 'gyakushu', 'pass', 'chat', 'ready', 'rematch_request'];
    if (!allowed.includes(msg.type)) return;

    try {
      partner.ws.send(JSON.stringify({ ...msg, from: from.color }));
    } catch (e) {}
  }
}
