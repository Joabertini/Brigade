import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomNav, type Section } from "./components/BottomNav";
import { CloudCheck, CloudOff } from "lucide-react";
import { CloudRepository, LocalRepository, isAccessError, type CatalogIngredient, type Identity, type PurchaseOrder, type Requirements, type StockMovement, type Supplier } from "./data/repository";
import { clearUserCache } from "./data/cloud-cache";
import { LoginView } from "./features/auth/LoginView";
import { mergeCourses } from "../shared/courses";
import { RecipesView } from "./features/recipes/RecipesView";
import { ProductionView } from "./features/production/ProductionView";
import { JoinView } from "./features/team/JoinView";
import { TeamView } from "./features/team/TeamView";
import { EventsView } from "./features/events/EventsView";
import { StockView } from "./features/stock/StockView";
import { OrdersView } from "./features/orders/OrdersView";
import type { LocalEvent, LocalProduction, LocalRecipe } from "./local-db";
import { HomeView } from "./features/home/HomeView";
import { MoreView, SyncView } from "./features/home/MoreViews";
import { ErrorNote, initials } from "./components/ui";

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
  const [courses, setCourses] = useState<string[]>(mergeCourses([]));
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [requirements, setRequirements] = useState<Requirements>({ needs: [], unlinked: [] });
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [focusProductionId, setFocusProductionId] = useState("");
  const [recipeIntent, setRecipeIntent] = useState<"" | "new" | "capture">("");
  const [navKey, setNavKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [requestedRecipe, setRequestedRecipe] = useState<LocalRecipe | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState({ waiting: 0, conflicts: 0 });
  const [loadError, setLoadError] = useState("");
  const repository = useMemo(() => mode === "cloud" && identity ? new CloudRepository(identity) : new LocalRepository(), [mode, identity]);

  useEffect(() => {
    // Temporary pilot entry: avoid the unreliable account flow on the tester's device.
    // Cloud sign-in remains available from Connection; no private API is opened anonymously.
    setMode(joinToken ? "join" : "local");
  }, [joinToken]);

  const refresh = useCallback(async () => {
    if (mode !== "local" && mode !== "cloud") return;
    try {
      await repository.syncPending();
      const commis = mode === "cloud" && identity?.role === "commis";
      const [recipeRows, eventRows, ingredientRows, movementRows, supplierRows, orderRows, requirementRows, courseRows] = await Promise.all([
        repository.listRecipes(), repository.listEvents(), repository.listIngredients(), repository.listStockMovements(),
        commis ? Promise.resolve([]) : repository.listSuppliers(),
        commis ? Promise.resolve([]) : repository.listOrders(),
        commis ? Promise.resolve({ needs: [], unlinked: [] }) : repository.listRequirements(),
        repository.listCourses(),
      ]);
      const productionRows = await repository.listProductions(recipeRows);
      const queued = await repository.pendingEntries();
      setRecipes(recipeRows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setProductions(productionRows.sort((a, b) => b.id.localeCompare(a.id)));
      setEvents(eventRows.sort((a, b) => b.eventDate.localeCompare(a.eventDate)));
      setIngredients(ingredientRows);
      setCourses(courseRows);
      setMovements(movementRows);
      setSuppliers(supplierRows);
      setOrders(orderRows);
      setRequirements(requirementRows);
      if (navigator.onLine) setLastSync(new Date());
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
    } finally {
      setReady(true);
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
    setRequirements({ needs: [], unlinked: [] });
    setIdentity(null);
    setMode("login");
  }

  function navigate(next: Section) {
    setSection(next);
    setNavKey((value) => value + 1);
    setRecipeIntent("");
    setRequestedRecipe(null);
    setFocusProductionId("");
    document.querySelector(".b2-scroll")?.scrollTo({ top: 0 });
  }

  function plan(recipe: LocalRecipe) {
    navigate("production");
    setRequestedRecipe(recipe);
  }

  function openProduction(id: string) {
    navigate("production");
    setFocusProductionId(id);
  }

  if (mode === "loading") return <div className="b2-frame"><header className="b2-header"><div className="b2-brand">brigade<em>.</em></div></header><main className="b2-login"><p className="b2-muted">Preparando tu cocina…</p></main></div>;
  if (mode === "join" && joinToken) return <JoinView token={joinToken} onJoined={loggedIn} />;
  if (mode === "login") return <LoginView onLogin={loggedIn} onLocal={chooseLocal} />;

  const commis = mode === "cloud" && identity?.role === "commis";
  const manager = mode === "local" || !commis;
  return <div className="b2-frame">
    <header className="b2-header">
      <div className="b2-brand">brigade<em>.</em></div>
      <div className="b2-headright">
        <button type="button" className="b2-sync" onClick={() => navigate("sync")}>{online ? <CloudCheck /> : <CloudOff />}{!online ? "Sin conexión" : pending.waiting ? `${pending.waiting} pendientes` : "Al día"}</button>
        <button type="button" className="b2-avatar" onClick={() => navigate("sync")} aria-label={identity ? `${identity.user.name}, ${identity.role}` : "Cuaderno local"}>{initials(identity?.user.name)}</button>
      </div>
    </header>
    <div className="b2-scroll" role="region" aria-label="Contenido">
      <main className="b2-content" key={navKey}>
        {!online && section !== "sync" && <div className="b2-offline">Guardado en este dispositivo · {pending.waiting} pendientes</div>}
        {mode === "cloud" && pending.conflicts > 0 && <div className="b2-offline">{pending.conflicts} registros con conflicto. Revisalos en Conexión.</div>}
        <ErrorNote>{loadError}</ErrorNote>
        {!ready ? <p className="b2-muted">Preparando tu cocina…</p> : <>
        {section === "today" && <HomeView name={identity?.user.name} commis={commis} productions={productions} requirements={requirements} lastSync={lastSync} onNavigate={navigate} onOpenProduction={openProduction} onCapture={() => { navigate("recipes"); setRecipeIntent("capture"); }} />}
        {section === "recipes" && <RecipesView recipes={recipes} ingredients={ingredients} cloudMode={mode === "cloud"} canPlan={manager} canLink={mode === "cloud" && !commis} online={online} currentUserId={identity?.user.id} intent={recipeIntent} onInterpret={(text) => repository.interpretRecipe(text)} onTranscribe={(image) => repository.transcribeRecipe(image)} courses={courses} canAddCourse={mode !== "cloud" || !commis} onAddCourse={async (name) => setCourses(await repository.addCourse(name))} onCourse={(recipe, course) => repository.setRecipeCourse(recipe, course)} onCreate={(version, course) => repository.createRecipe(version, course)} onSaved={refresh} onPlan={plan} onMembers={() => repository.listMembers()} onShare={(recipeId, userId) => repository.shareRecipe(recipeId, userId)} onVisibility={(recipeId, visibility) => repository.setRecipeVisibility(recipeId, visibility)} onLink={(recipeId, ingredientId, catalogId) => repository.linkIngredient(recipeId, ingredientId, catalogId)} />}
        {section === "production" && <ProductionView recipes={recipes} productions={productions} events={events} ingredients={ingredients} requirements={requirements} requestedRecipe={requestedRecipe} focusProductionId={focusProductionId} cloudMode={mode === "cloud"} canPlan={manager} onPlan={(recipe, target, date, eventId) => repository.planProduction(recipe, target, date, eventId)} onRecord={(production, amount) => repository.recordBatch(production, amount)} onSaved={refresh} onOrders={() => navigate("orders")} onRecipes={() => navigate("recipes")} />}
        {section === "team" && <TeamView identity={identity} onMembers={() => repository.listMembers()} onInvite={(email, role) => repository.inviteMember(email, role)} />}
        {section === "events" && <EventsView events={events} productions={productions} canEdit={manager} onSave={(event) => repository.saveEvent(event)} onSaved={refresh} onOpenProduction={openProduction} />}
        {section === "stock" && <StockView ingredients={ingredients} movements={movements} cloudMode={mode === "cloud"} canEdit={!commis} online={online} lastSync={lastSync} onCreate={(name, unit) => repository.createIngredient(name, unit)} onMovement={(ingredientId, delta, kind, note) => repository.recordStockMovement(ingredientId, delta, kind, note)} onSaved={refresh} />}
        {section === "orders" && <OrdersView suppliers={suppliers} ingredients={ingredients} orders={orders} requirements={requirements} cloudMode={mode === "cloud"} canEdit={!commis} online={online} onSupplier={(name, contact) => repository.createSupplier(name, contact)} onOrder={(supplierId, lines, note, orderId) => repository.createOrder(supplierId, lines, note, orderId)} onStatus={(orderId, status) => repository.setOrderStatus(orderId, status)} onReceipt={(orderId, lines, operationId) => repository.receiveOrder(orderId, lines, operationId)} onSaved={refresh} />}
        {section === "more" && <MoreView commis={commis} onNavigate={navigate} onNewRecipe={() => { navigate("recipes"); setRecipeIntent("new"); }} onCapture={() => { navigate("recipes"); setRecipeIntent("capture"); }} />}
        {section === "sync" && <SyncView online={online} cloudMode={mode === "cloud"} pending={pending.waiting} conflicts={pending.conflicts} recipes={recipes.length} lastSync={lastSync} onSync={() => void refresh()} onSignOut={() => void signOut()} onConnect={() => setMode("login")} />}
        </>}
      </main>
    </div>
    <BottomNav section={section} commis={commis} onNavigate={navigate} />
  </div>;
}
