import { useState } from "react";
import { useAuth } from "../lib/auth";

export default function LoginScreen() {
  const { signIn } = useAuth();
    const [email,    setEmail]    = useState("");
      const [password, setPassword] = useState("");
        const [loading,  setLoading]  = useState(false);
          const [error,    setError]    = useState(null);

            async function handleSubmit(e) {
                e.preventDefault();
                    setLoading(true); setError(null);
                        const { error } = await signIn(email, password);
                            if (error) setError(typeof error === "string" ? error : "Credenciales incorrectas");
                                setLoading(false);
                                  }

                                    return (
                                        <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--color-ink-0)", padding:24 }}>
                                              <form onSubmit={handleSubmit} style={{ width:"100%", maxWidth:360 }}>

                                                      <div style={{ fontFamily:"var(--font-cond)", fontSize:"2.5rem", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:"var(--color-ember)", marginBottom:4 }}>
                                                                Brigade
                                                                        </div>
                                                                                <div style={{ fontSize:".82rem", color:"var(--color-muted)", marginBottom:32 }}>
                                                                                          Ingresá con tus credenciales
                                                                                                  </div>

                                                                                                          {error && (
                                                                                                                    <div style={{ background:"var(--color-danger-bg)", border:"1px solid #4a1a1a", color:"#c07070", fontSize:".78rem", padding:"8px 12px", marginBottom:16 }}>
                                                                                                                                {error}
                                                                                                                                          </div>
                                                                                                                                                  )}

                                                                                                                                                          <div style={{ marginBottom:16 }}>
                                                                                                                                                                    <label style={{ display:"block", fontFamily:"var(--font-cond)", fontSize:".6rem", letterSpacing:".15em", textTransform:"uppercase", color:"var(--color-muted)", marginBottom:6 }}>
                                                                                                                                                                                Email
                                                                                                                                                                                          </label>
                                                                                                                                                                                                    <input
                                                                                                                                                                                                                type="email" placeholder="tu@cocina.com" required
                                                                                                                                                                                                                            value={email} onChange={e => setEmail(e.target.value)}
                                                                                                                                                                                                                                        style={{ width:"100%", background:"var(--color-ink-1)", border:"1px solid var(--color-ink-4)", color:"var(--color-text)", fontFamily:"var(--font-body)", fontSize:".9rem", padding:"10px 12px", outline:"none" }}
                                                                                                                                                                                                                                                  />
                                                                                                                                                                                                                                                          </div>

                                                                                                                                                                                                                                                                  <div style={{ marginBottom:20 }}>
                                                                                                                                                                                                                                                                            <label style={{ display:"block", fontFamily:"var(--font-cond)", fontSize:".6rem", letterSpacing:".15em", textTransform:"uppercase", color:"var(--color-muted)", marginBottom:6 }}>
                                                                                                                                                                                                                                                                                        Contraseña
                                                                                                                                                                                                                                                                                                  </label>
                                                                                                                                                                                                                                                                                                            <input
                                                                                                                                                                                                                                                                                                                        type="password" placeholder="••••••••" required
                                                                                                                                                                                                                                                                                                                                    value={password} onChange={e => setPassword(e.target.value)}
                                                                                                                                                                                                                                                                                                                                                style={{ width:"100%", background:"var(--color-ink-1)", border:"1px solid var(--color-ink-4)", color:"var(--color-text)", fontFamily:"var(--font-body)", fontSize:".9rem", padding:"10px 12px", outline:"none" }}
                                                                                                                                                                                                                                                                                                                                                          />
                                                                                                                                                                                                                                                                                                                                                                  </div>

                                                                                                                                                                                                                                                                                                                                                                          <button
                                                                                                                                                                                                                                                                                                                                                                                    type="submit" disabled={loading}
                                                                                                                                                                                                                                                                                                                                                                                              style={{ width:"100%", minHeight:46, fontFamily:"var(--font-cond)", fontSize:".72rem", fontWeight:600, letterSpacing:".16em", textTransform:"uppercase", border:"1px solid var(--color-ember-dim)", color:"var(--color-ember)", background:"var(--color-ember-bg)", cursor:"pointer" }}
                                                                                                                                                                                                                                                                                                                                                                                                      >
                                                                                                                                                                                                                                                                                                                                                                                                                {loading ? "Verificando..." : "Entrar a Brigade →"}
                                                                                                                                                                                                                                                                                                                                                                                                                        </button>

                                                                                                                                                                                                                                                                                                                                                                                                                              </form>
                                                                                                                                                                                                                                                                                                                                                                                                                                  </div>
                                                                                                                                                                                                                                                                                                                                                                                                                                    );
                                                                                                                                                                                                                                                                                                                                                                                                                                    }