import { useAuth, AuthProvider } from "./lib/auth";
import LoginScreen   from "./components/LoginScreen";
import ChefLayout    from "./components/ChefLayout";
import CommisLayout  from "./components/CommisLayout";
import LoadingScreen from "./components/LoadingScreen";

function AppRouter() {
  const { session, profile, loading } = useAuth();

    if (loading)              return <LoadingScreen />;
      if (!session || !profile) return <LoginScreen />;

        switch (profile.role) {
            case "chef":
                case "sous_chef":
                      return <ChefLayout />;
                          case "commis":
                                return <CommisLayout />;
                                    default:
                                          return <LoginScreen />;
                                            }
                                            }

                                            export default function App() {
                                              return (
                                                  <AuthProvider>
                                                        <AppRouter />
                                                            </AuthProvider>
                                                              );
                                                              }