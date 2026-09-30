import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomNav, type Section } from "./components/BottomNav";
import { CloudRepository, LocalRepository, isAccessError, type CatalogIngredient, type Identity, type PurchaseOrder, type StockMovement, type Supplier } from "./data/repository";
import { clearUserCache } from "./data/cloud-cache";
import { LoginView } from "./features/auth/LoginView";
import { RecipesView } from "./features/recipes/RecipesView";
import { ProductionView } from "./features/production/ProductionView";
import { JoinView } from "./features/team/JoinView";
import { TeamView } from "./features/team/TeamView";
import { EventsView } from "./features/events/EventsView";
import { StockView } from "./features/stock/StockView";
import { OrdersView } from "./features/orders/OrdersView";
import type { LocalEvent, LocalProduction, LocalRecipe } from "./local-db";
import { formatMilli } from "../shared/kitchen";

type Mode = "loading" | "login" | "join" | "local" | "cloud";
const identityKey = "brigade_last_identity";
const modeKey = "brigade_last_mode";

export default function App() {
  const [mode, setMode] = useState<Mode>("loading");
  const [joinToken, setJoinToken] = useState(new URLSearchParams(location.search).get("invite"));
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [section, setSection] = useState<Section>("today");
  const [recipes, setRecipes] = useState<LocalRecipe[]>([]);
  const [productions, setProductions] = useState<LocalProduction[]>([]);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [ingredients, setIngredients] = useState<CatalogIngredient[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [requestedRecipe, setRequestedRecipe] = useState<LocalRecipe | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState({ waiting: 0, conflicts: 0 });
  const [loadError, setLoadError] = useState("");
  const repository = useMemo(() => mode === "cloud" && identity ? new CloudRepository(identity) : new LocalRepository(), [mode, identity]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (joinToken) { setMode("join"); return; }
      let cached: Identity | null = null;
      try { cached = JSON.parse(localStorage.getItem(identityKey) || "null") as Identity | null; } catch { /* no saved identity */ }
      if (navigator.onLine) {
        try {
          const response = await fetch("/api/me", { credentials: "same-origin" });
          if (response.ok) {
            const data = await response.json() as {
              user: Identity["user"];
              memberships: { kitchen_id: string; role: Identity["role"] }[];
            };
            if (data.memberships[0]) {
              const restored: Identity = { user: data.user, kitchenId: data.memberships[0].kitchen_id, role: data.memberships[0].role };
              if (cached && (cached.user.id !== restored.user.id || cached.kitchenId !== restored.kitchenId)) {
                void clearUserCache(cached.user.id, cached.kitchenId).catch(() => {});
              }
              if (!cancelled) {
                setIdentity(restored); setMode("cloud");
                localStorage.setItem(identityKey, JSON.stringify(restored));
              }
              return;
            }
            if (cached) void clearUserCache(cached.user.id, cached.kitchenId).catch(() => {});
            cached = null;
          }
          if (response.status === 401 || response.status === 403) {
            if (cached) void clearUserCache(cached.user.id, cached.kitchenId).catch(() => {});
            cached = null;
          }
        } catch { /* cached mode can keep working during a network failure */ }
      }
      if (cancelled) return;
      if (cached) { setIdentity(cached); setMode("cloud"); }
      else {
        localStorage.removeItem(identityKey);
        setMode(localStorage.getItem(modeKey) === "local" ? "local" : "login");
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, [joinToken]);

  const refresh = useCallback(async () => {
    if (mode !== "local" && mode !== "cloud") return;
    try {
      await repository.syncPending();
      const [recipeRows, eventRows, ingredientRows, movementRows, supplierRows, orderRows] = await Promise.all([
        repository.listRecipes(), repository.listEvents(), repository.listIngredients(), repository.listStockMovements(),
        mode === "cloud" && identity?.role === "commis" ? Promise.resolve([]) : repository.listSuppliers(),
        mode === "cloud" && identity?.role === "commis" ? Promise.resolve([]) : repository.listOrders(),
      ]);
      const productionRows = await repository.listProductions(recipeRows);
      const queued = await repository.pendingEntries();
      setRecipes(recipeRows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setProductions(productionRows.sort((a, b) => b.id.localeCompare(a.id)));
      setEvents(eventRows.sort((a, b) => b.eventDate.localeCompare(a.eventDate)));
      setIngredients(ingredientRows);
      setMovements(movementRows);
      setSuppliers(supplierRows);
      setOrders(orderRows);
      setPending({
        waiting: queued.filter((entry) => entry.status === "pending").length,
        conflicts: queued.filter((entry) => entry.status === "conflict").length,
      });
      setLoadError("");
    } catch (cause) {
      if (mode === "cloud" && identity && isAccessError(cause)) {
        setRecipes([]); setProductions([]); setEvents([]); setIngredients([]); setMovements([]); setSuppliers([]); setOrders([]);
        localStorage.removeItem(identityKey);
        setIdentity(null);
        setMode("login");
        await clearUserCache(identity.user.id, identity.kitchenId).catch(() => {});
      }
      setLoadError(cause instanceof Error ? cause.message : "No se pudieron cargar los datos");
    }
  }, [mode, repository, identity]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onNetwork = () => { setOnline(navigator.onLine); void refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    window.addEventListener("focus", onNetwork);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      window.removeEventListener("focus", onNetwork);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  function chooseLocal() {
    localStorage.setItem(modeKey, "local");
    setIdentity(null);
    setMode("local");
  }

  function loggedIn(value: Identity) {
    localStorage.setItem(identityKey, JSON.stringify(value));
    localStorage.setItem(modeKey, "cloud");
    setIdentity(value);
    setJoinToken(null);
    setMode("cloud");
  }

  async function signOut() {
    if (pending.waiting || pending.conflicts) {
      setLoadError("Hay registros pendientes o en conflicto. Resolvelos antes de cerrar sesión.");
      return;
    }
    if (!navigator.onLine) {
      setLoadError("Conectate para cerrar sesión de forma segura.");
      return;
    }
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión. Intentá de nuevo.");
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "No se pudo cerrar la sesión");
      return;
    }
    if (identity) await clearUserCache(identity.user.id, identity.kitchenId).catch(() => {});
    localStorage.removeItem(identityKey);
    setRecipes([]); setProductions([]); setEvents([]); setIngredients([]); setMovements([]); setSuppliers([]); setOrders([]);
    setIdentity(null);
    setMode("login");
  }

  function navigate(next: Section) {
    setSection(next);
    if (next !== "production") setRequestedRecipe(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function plan(recipe: LocalRecipe) {
    setRequestedRecipe(recipe);
    navigate("production");
  }

  if (mode === "loading") return <div className="login-shell"><div className="brand">brigade<span>.</span></div><p className="muted">Preparando tu cocina…</p></div>;
  if (mode === "join" && joinToken) return <JoinView token={joinToken} onJoined={loggedIn} />;
  if (mode === "login") return <LoginView onLogin={loggedIn} onLocal={chooseLocal} />;

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand">brigade<span>.</span></div>
      <div className="header-right">
        <button className="connection connection-button" onClick={() => void refresh()} title="Sincronizar ahora"><span className={online ? "dot" : "dot offline"} />{online ? "Sincronizar" : "Sin conexión"}</button>
        <button className="avatar avatar-button" onClick={() => mode === "cloud" ? void signOut() : setMode("login")} title={mode === "cloud" ? "Cerrar sesión" : "Conectar cocina"} aria-label={mode === "cloud" ? "Cerrar sesión" : "Conectar cocina"}>
          {identity?.user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "BC"}
        </button>
      </div>
    </header>
    <main className="main-content">
      {loadError && <p className="error" role="alert">{loadError}</p>}
      {mode === "cloud" && (pending.waiting > 0 || pending.conflicts > 0) &&
        <p className="sync-banner" role="status">{pending.waiting} registros esperando sincronización · {pending.conflicts} con conflicto</p>}
      {section === "today" && <section>
        <p className="eyebrow">COCINA DE HOY</p>
        <h1>Todo en su<br />lugar.</h1>
        <p className="lead">Recetas, cantidades y trabajo de producción al alcance de tu equipo.</p>
        <div className="home-grid">
          <div className="focus-card">
            <span className="eyebrow">SIGUIENTE PASO</span>
            <h2 className="dish">{productions[0]?.recipe.title ?? "Tu primera receta"}</h2>
            <p>{productions[0] ? formatMilli(productions[0].producedYieldMilli, productions[0].recipe.yieldUnit) + " de " + formatMilli(productions[0].targetYieldMilli, productions[0].recipe.yieldUnit) + " producidos" : "Ingresá una receta y empezá a planificar desde ella."}</p>
            <button className="primary" onClick={() => navigate(productions.length ? "production" : "recipes")}>{productions.length ? "Abrir producción" : "Abrir recetario"} →</button>
          </div>
          <div className="panel">
            <p className="eyebrow">{mode === "cloud" ? "TU COCINA" : "EN ESTE DISPOSITIVO"}</p>
            <div className="home-metric"><strong>{recipes.length}</strong><span>recetas disponibles</span></div>
            <div className="home-metric"><strong>{productions.length}</strong><span>producciones registradas</span></div>
            <p className="muted">{mode === "cloud" ? "Lo consultado queda en el dispositivo. Las tandas sin red se envían al recuperar conexión." : "Cuaderno local: disponible sin conexión, todavía sin respaldo ni acceso del equipo."}</p>
          </div>
        </div>
      </section>}
      {section === "recipes" && <RecipesView recipes={recipes} cloudMode={mode === "cloud"} canPlan={mode === "local" || identity?.role !== "commis"} currentUserId={identity?.user.id} onCreate={(version) => repository.createRecipe(version)} onSaved={refresh} onPlan={plan} onMembers={() => repository.listMembers()} onShare={(recipeId, userId) => repository.shareRecipe(recipeId, userId)} onVisibility={(recipeId, visibility) => repository.setRecipeVisibility(recipeId, visibility)} />}
      {section === "production" && <ProductionView recipes={recipes} productions={productions} events={events} requestedRecipe={requestedRecipe} cloudMode={mode === "cloud"} canPlan={mode === "local" || identity?.role !== "commis"} onPlan={(recipe, target, date, eventId) => repository.planProduction(recipe, target, date, eventId)} onRecord={(production, amount) => repository.recordBatch(production, amount)} onSaved={refresh} />}
      {section === "team" && <TeamView identity={identity} onMembers={() => repository.listMembers()} onInvite={(email, role) => repository.inviteMember(email, role)} />}
      {section === "events" && <EventsView events={events} productions={productions} canEdit={mode === "local" || identity?.role !== "commis"} onSave={(event) => repository.saveEvent(event)} onSaved={refresh} />}
      {section === "stock" && <StockView ingredients={ingredients} movements={movements} cloudMode={mode === "cloud"} canEdit={identity?.role !== "commis"} online={online} onCreate={(name, unit) => repository.createIngredient(name, unit)} onMovement={(ingredientId, delta, kind, note) => repository.recordStockMovement(ingredientId, delta, kind, note)} onSaved={refresh} />}
      {section === "orders" && <OrdersView suppliers={suppliers} ingredients={ingredients} orders={orders} cloudMode={mode === "cloud"} canEdit={identity?.role !== "commis"} online={online} onSupplier={(name, contact) => repository.createSupplier(name, contact)} onOrder={(supplierId, lines, note, orderId) => repository.createOrder(supplierId, lines, note, orderId)} onStatus={(orderId, status) => repository.setOrderStatus(orderId, status)} onReceipt={(orderId, lines, operationId) => repository.receiveOrder(orderId, lines, operationId)} onSaved={refresh} />}
      {section === "more" && <section><p className="eyebrow">BRIGADE</p><h1>Tu cocina,<br />completa.</h1><div className="more-grid">{(["stock", "team", "events"] as const).map((item) => <button className="more-card" onClick={() => navigate(item)} key={item}>{({stock:"Stock",team:"Equipo",events:"Eventos"})[item]} <span>↗</span></button>)}</div></section>}
    </main>
    <BottomNav section={section} onNavigate={navigate} />
  </div>;
}
