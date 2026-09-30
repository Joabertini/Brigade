export default function LoadingScreen() {
      return (
          <div style={{
                minHeight:"100vh", display:"flex", alignItems:"center",
                      justifyContent:"center", flexDirection:"column", gap:16,
                            background:"var(--color-ink-0)"
                                }}>
                                      <div style={{
                                              fontFamily:"var(--font-cond)", fontSize:"2.5rem", fontWeight:700,
                                                      letterSpacing:".15em", textTransform:"uppercase", color:"var(--color-ember)"
                                                            }}>Brigade</div>
                                                                  <div style={{
                                                                          width:20, height:20, border:"2px solid var(--color-ink-4)",
                                                                                  borderTopColor:"var(--color-ember)", borderRadius:"50%",
                                                                                          animation:"spin .7s linear infinite"
                                                                                                }}/>
                                                                                                    </div>
                                                                                                      );
                                                                                                      }