import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function StockView() {
  const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

      useEffect(() => {
          supabase.select("stock_entries", {
                columns: "id,qty,unit,expires_at,stock_items(name),stock_locations(name)",
                      filters: { voided: false },
                            order: "recorded_at.desc",
                                  limit: 50,
                                      }).then(({ data }) => {
                                            setEntries(data || []);
                                                  setLoading(false);
                                                      });
                                                        }, []);

                                                          if (loading) return (
                                                              <div style={{ padding:24, color:"var(--color-muted)", fontFamily:"var(--font-cond)", fontSize:".72rem", letterSpacing:".15em", textTransform:"uppercase" }}>
                                                                    Cargando stock…
                                                                        </div>
                                                                          );

                                                                            return (
                                                                                <div style={{ padding:20, overflow:"auto", height:"100%" }}>
                                                                                      <div style={{ fontFamily:"var(--font-cond)", fontSize:".65rem", letterSpacing:".18em", textTransform:"uppercase", color:"var(--color-ember)", marginBottom:16 }}>
                                                                                              Inventario — {entries.length} registros
                                                                                                    </div>
                                                                                                          {entries.length === 0 ? (
                                                                                                                  <div style={{ color:"var(--color-muted)", fontFamily:"var(--font-cond)", fontSize:".72rem", letterSpacing:".12em", textTransform:"uppercase" }}>
                                                                                                                            Sin registros de stock aún
                                                                                                                                    </div>
                                                                                                                                          ) : (
                                                                                                                                                  entries.map(e => (
                                                                                                                                                            <div key={e.id} style={{ background:"var(--color-ink-1)", border:"1px solid var(--color-ink-4)", padding:"10px 12px", marginBottom:4, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                                                                                                                                                        <div>
                                                                                                                                                                                      <div style={{ fontFamily:"var(--font-cond)", fontSize:".82rem", fontWeight:600, letterSpacing:".04em", textTransform:"uppercase" }}>
                                                                                                                                                                                                      {e.stock_items?.name || "—"}
                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                  <div style={{ fontFamily:"var(--font-cond)", fontSize:".6rem", letterSpacing:".08em", textTransform:"uppercase", color:"var(--color-muted)", marginTop:2 }}>
                                                                                                                                                                                                                                                  {e.stock_locations?.name || "—"} · {e.expires_at || "Sin vencimiento"}
                                                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                                                        <div style={{ fontFamily:"var(--font-cond)", fontSize:"1.1rem", fontWeight:700, color: e.qty===0 ? "var(--color-danger)" : "var(--color-text)" }}>
                                                                                                                                                                                                                                                                                                      {e.qty} <span style={{ fontSize:".65rem", color:"var(--color-muted)" }}>{e.unit}</span>
                                                                                                                                                                                                                                                                                                                  </div>
                                                                                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                                                                                                    ))
                                                                                                                                                                                                                                                                                                                                          )}
                                                                                                                                                                                                                                                                                                                                              </div>
                                                                                                                                                                                                                                                                                                                                                );
                                                                                                                                                                                                                                                                                                                                                }