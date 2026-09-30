import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(supabase.getSession());
    const [profile, setProfile] = useState(null);
      const [loading, setLoading] = useState(true);

        useEffect(() => {
            const unsub = supabase.onAuthStateChange(async (sess) => {
                  setSession(sess);
                        if (sess?.user?.id) {
                                const { data } = await supabase.select("profiles", {
                                          filters: { id: sess.user.id },
                                                    single: true,
                                                            });
                                                                    setProfile(data);
                                                                          } else {
                                                                                  setProfile(null);
                                                                                        }
                                                                                              setLoading(false);
                                                                                                  });
                                                                                                      return unsub;
                                                                                                        }, []);

                                                                                                          async function signIn(email, password) {
                                                                                                              return await supabase.signIn(email, password);
                                                                                                                }

                                                                                                                  async function signOut() {
                                                                                                                      await supabase.signOut();
                                                                                                                        }

                                                                                                                          return (
                                                                                                                              <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>
                                                                                                                                    {children}
                                                                                                                                        </AuthContext.Provider>
                                                                                                                                          );
                                                                                                                                          }

                                                                                                                                          export function useAuth() {
                                                                                                                                            return useContext(AuthContext);
                                                                                                                                            }