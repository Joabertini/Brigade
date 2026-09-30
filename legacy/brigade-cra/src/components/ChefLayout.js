import { useState } from "react";
import { useAuth } from "../lib/auth";
import TasksDashboard from "./TasksDashboard";
import SchedulerView from "./SchedulerView";
import StockView from "./StockView";

const TABS = [
  { id:"tasks",    label:"Tareas" },
    { id:"schedule", label:"Turnos" },
      { id:"stock",    label:"Stock" },
      ];

      function initials(name = "") {
        return name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
        }

        export default function ChefLayout() {
          const { profile, signOut } = useAuth();
            const [tab, setTab] = useState("tasks");

              return (
                  <div style={{ minHeight:"100vh", display:"grid", gridTemplateRows:"52px 1fr" }}>

                        <nav style={{ background:"var(--color-ink-1)", borderBottom:"1px solid var(--color-ink-4)", display:"flex", alignItems:"center", padding:"0 16px", gap:12 }}>
                                <span style={{ fontFamily:"var(--font-cond)", fontSize:"1.1rem", fontWeight:700, letterSpacing:".15em", textTransform:"uppercase", color:"var(--color-ember)" }}>
                                          Brigade
                                                  </span>
                                                          <div style={{ width:1, height:20, background:"var(--color-ink-4)" }}/>
                                                                  <div style={{ display:"flex", gap:4 }}>
                                                                            {TABS.map(t => (
                                                                                        <button key={t.id} onClick={() => setTab(t.id)} style={{
                                                                                                      fontFamily:"var(--font-cond)", fontSize:".68rem", letterSpacing:".12em",
                                                                                                                    textTransform:"uppercase", padding:"4px 14px", border:"1px solid",
                                                                                                                                  cursor:"pointer", background:"none",
                                                                                                                                                borderColor: tab===t.id ? "var(--color-ember-dim)" : "transparent",
                                                                                                                                                              color: tab===t.id ? "var(--color-ember)" : "var(--color-muted)",
                                                                                                                                                                            backgroundColor: tab===t.id ? "var(--color-ember-bg)" : "transparent",
                                                                                                                                                                                        }}>
                                                                                                                                                                                                      {t.label}
                                                                                                                                                                                                                  </button>
                                                                                                                                                                                                                            ))}
                                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
                                                                                                                                                                                                                                                      <div style={{ width:28, height:28, background:"var(--color-ember-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-cond)", fontSize:".7rem", fontWeight:700, color:"var(--color-ember)", textTransform:"uppercase" }}>
                                                                                                                                                                                                                                                                  {initials(profile?.full_name)}
                                                                                                                                                                                                                                                                            </div>
                                                                                                                                                                                                                                                                                      <span style={{ fontFamily:"var(--font-cond)", fontSize:".68rem", letterSpacing:".08em", textTransform:"uppercase" }}>
                                                                                                                                                                                                                                                                                                  {profile?.full_name?.split(" ")[0]}
                                                                                                                                                                                                                                                                                                            </span>
                                                                                                                                                                                                                                                                                                                      <button onClick={signOut} style={{ background:"none", border:"1px solid var(--color-ink-4)", color:"var(--color-muted)", fontFamily:"var(--font-cond)", fontSize:".6rem", letterSpacing:".12em", textTransform:"uppercase", padding:"4px 10px", cursor:"pointer" }}>
                                                                                                                                                                                                                                                                                                                                  Salir
                                                                                                                                                                                                                                                                                                                                            </button>
                                                                                                                                                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                                                                                                                                          </nav>

                                                                                                                                                                                                                                                                                                                                                                <div style={{ overflow:"hidden", minHeight:0 }}>
                                                                                                                                                                                                                                                                                                                                                                        {tab==="tasks"    && <TasksDashboard />}
                                                                                                                                                                                                                                                                                                                                                                                {tab==="schedule" && <SchedulerView />}
                                                                                                                                                                                                                                                                                                                                                                                        {tab==="stock"    && <StockView />}
                                                                                                                                                                                                                                                                                                                                                                                              </div>

                                                                                                                                                                                                                                                                                                                                                                                                  </div>
                                                                                                                                                                                                                                                                                                                                                                                                    );
                                                                                                                                                                                                                                                                                                                                                                                                    }