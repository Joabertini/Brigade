const SUPABASE_URL      = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this._session = null;
    this._listeners = [];
    this._realtimeChannels = {};
    this._loadSession();
  }

  _loadSession() {
    try {
      const raw = localStorage.getItem("brigade_session");
      if (raw) this._session = JSON.parse(raw);
    } catch {}
  }

  _saveSession(session) {
    this._session = session;
    if (session) localStorage.setItem("brigade_session", JSON.stringify(session));
    else localStorage.removeItem("brigade_session");
    this._listeners.forEach(fn => fn(session));
  }

  onAuthStateChange(fn) {
    this._listeners.push(fn);
    fn(this._session);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  getSession() { return this._session; }
  getUser()    { return this._session?.user || null; }
  getToken()   { return this._session?.access_token || null; }

  async signIn(email, password) {
    const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": this.key },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: data.error_description || "Error al iniciar sesión" };
    this._saveSession(data);
    return { data, error: null };
  }

  async signOut() {
    const token = this.getToken();
    if (token) {
      await fetch(`${this.url}/auth/v1/logout`, {
        method: "POST",
        headers: { "apikey": this.key, "Authorization": `Bearer ${token}` },
      }).catch(() => {});
    }
    this._saveSession(null);
    return { error: null };
  }

  _headers(extra = {}) {
    const h = { "apikey": this.key, "Content-Type": "application/json", ...extra };
    const token = this.getToken();
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  async select(table, { columns = "*", filters = {}, single = false, order = null, limit = null } = {}) {
    let url = `${this.url}/rest/v1/${table}?select=${encodeURIComponent(columns)}`;
    Object.entries(filters).forEach(([k, v]) => {
      if (typeof v === "object" && v !== null) {
        url += `&${k}=${v.op}.${encodeURIComponent(v.val)}`;
      } else {
        url += `&${k}=eq.${encodeURIComponent(v)}`;
      }
    });
    if (order)  url += `&order=${order}`;
    if (limit)  url += `&limit=${limit}`;
    if (single) url += "&limit=1";
    const res = await fetch(url, {
      headers: this._headers(),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: data.message || data };
    return { data: single ? (Array.isArray(data) ? data[0] || null : data) : data, error: null };
  }

  async insert(table, rows, { returning = true } = {}) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: "POST",
      headers: this._headers(returning ? { "Prefer": "return=representation" } : {}),
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    });
    const data = returning ? await res.json() : null;
    if (!res.ok) return { data: null, error: data?.message || data };
    return { data, error: null };
  }

  async update(table, patch, filters = {}) {
    let url = `${this.url}/rest/v1/${table}?`;
    Object.entries(filters).forEach(([k, v]) => { url += `${k}=eq.${encodeURIComponent(v)}&`; });
    const res = await fetch(url, {
      method: "PATCH",
      headers: this._headers({ "Prefer": "return=representation" }),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: data?.message || data };
    return { data, error: null };
  }

  async delete(table, filters = {}) {
    let url = `${this.url}/rest/v1/${table}?`;
    Object.entries(filters).forEach(([k, v]) => { url += `${k}=eq.${encodeURIComponent(v)}&`; });
    const res = await fetch(url, { method: "DELETE", headers: this._headers() });
    if (!res.ok) { const d = await res.json(); return { error: d?.message || d }; }
    return { error: null };
  }

  channel(name) {
    const client = this;
    const subs = [];
    let ws = null;
    return {
      on(event, filter, callback) {
        subs.push({ event, filter, callback });
        return this;
      },
      subscribe(onStatus) {
        const token = client.getToken();
        const wsUrl = `${client.url.replace("https", "wss")}/realtime/v1/websocket?apikey=${client.key}&vsn=1.0.0`;
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            topic: `realtime:${name}`, event: "phx_join",
            payload: { access_token: token }, ref: "1",
          }));
        };
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.event === "phx_reply" && msg.payload?.status === "ok") onStatus?.("SUBSCRIBED");
            if (msg.event === "postgres_changes") {
              subs.forEach(sub => sub.callback(msg.payload?.data));
            }
          } catch {}
        };
        ws.onerror = () => onStatus?.("CHANNEL_ERROR");
        ws.onclose = () => onStatus?.("CLOSED");
        client._realtimeChannels[name] = ws;
        return this;
      },
      unsubscribe() {
        if (ws) ws.close();
        delete client._realtimeChannels[name];
      },
    };
  }
}

export const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);