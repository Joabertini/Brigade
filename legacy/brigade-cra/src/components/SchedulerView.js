import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SchedulerView() {
  const [schedules, setSchedules] = useState([]);
    const [loading,   setLoading]   = useState(true);

      useEffect(() => {
          supabase.select("schedules", {
                order: "week_start.desc", limit: 5,
                    }).then(({ data }) => {
                          setSchedules(data || []);
                                setLoading(false);
                                    });
                                      }, []);

                                        if (loading) return (
                                            <div style={{ padding:24, color:"var(--color-muted)", fontFamily:"var(--font-cond)", fontSize:".72rem", letterSpacing:".15em", textTransform:"uppercase" }}>
                                                  Cargando turnos…
                                                      </div>
                                                        );

                                                          return (
                                                              <div style={{ padding:20, overflow:"auto", height:"100%" }}>
                                                                    <div style={{ fontFamily:"var(--font-cond)", fontSize:".65rem", letterSpacing:".18em", textTransform:"uppercase", color:"var(--color-ember)", marginBottom:16 }}>
                                                                            Horarios semanales
                                                                                  </div>
                                                                                        {schedules.length === 0 ? (
                                                                                                <div style={{ color:"var(--color-muted)", fontFamily:"var(--font-cond)", fontSize:".72rem", letterSpacing:".12em", textTransform:"uppercase" }}>
                                                                                                          Sin horarios publicados aún
                                                                                                                  </div>
                                                                                                                        ) : (
                                                                                                                                schedules.map(s => (
                                                                                                                                          <div key={s.id} style={{ background:"var(--color-ink-1)", border:"1px solid var(--color-ink-4)", padding:"12px 14px", marginBottom:6 }}>
                                                                                                                                                      <div style={{ fontFamily:"var(--font-cond)", fontSize:".82rem", fontWeight:600, letterSpacing:".04em", textTransform:"uppercase" }}>
                                                                                                                                                                    Semana {s.week_start}
                                                                                                                                                                                </div>
                                                                                                                                                                                            <div style={{ fontFamily:"var(--font-cond)", fontSize:".6rem", letterSpacing:".1em", textTransform:"uppercase", color:"var(--color-muted)", marginTop:3 }}>
                                                                                                                                                                                                          {s.published ? "✓ Publicado" : "Borrador"}
                                                                                                                                                                                                                      </div>
                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                        ))
                                                                                                                                                                                                                                              )}
                                                                                                                                                                                                                                                  </div>
                                                                                                                                                                                                                                                    );
                                                                                                                                                                                                                                                    }