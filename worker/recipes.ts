import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cleanCourse, courseKey, mergeCourses } from "../shared/courses";
import { assertPositiveMilli, compatibleStockUnit, type RecipeVersion, type StockUnit, type Unit } from "../shared/kitchen";
import type { AuthBindings } from "./auth";
import { requireManager, requireMember, type KitchenRole } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;
const units = new Set<Unit>(["g", "kg", "ml", "L", "un", "atado", "paq", "bandeja", "porción"]);

type IngredientInput = { name: string; netMilli: number; unit: Unit; wastePermille: number; catalogIngredientId?: string | null };
type StepInput = { title: string; instruction: string; ingredientIndexes: number[] };
type RecipeInput = {
  title: string;
  description: string;
  yieldMilli: number;
  yieldUnit: Unit;
  ingredients: IngredientInput[];
  steps: StepInput[];
  course?: string | null;
};

function validateInput(raw: unknown): RecipeInput {
  if (!raw || typeof raw !== "object") throw new HTTPException(400, { message: "Receta inválida" });
  const data = raw as Partial<RecipeInput>;
  if (!data.title?.trim() || data.title.length > 200 || typeof data.description !== "string" || data.description.length > 5000) {
    throw new HTTPException(400, { message: "Nombre o descripción inválida" });
  }
  try { assertPositiveMilli(data.yieldMilli!, "Rendimiento"); } catch { throw new HTTPException(400, { message: "Rendimiento inválido" }); }
  if (!units.has(data.yieldUnit!)) throw new HTTPException(400, { message: "Unidad de rendimiento inválida" });
  if (!Array.isArray(data.ingredients) || !data.ingredients.length || data.ingredients.length > 100) {
    throw new HTTPException(400, { message: "Ingredientes inválidos" });
  }
  data.ingredients.forEach((ingredient) => {
    if (!ingredient || typeof ingredient.name !== "string" || !ingredient.name.trim() || ingredient.name.length > 200 || !units.has(ingredient.unit)) {
      throw new HTTPException(400, { message: "Ingrediente inválido" });
    }
    try { assertPositiveMilli(ingredient.netMilli, ingredient.name); } catch { throw new HTTPException(400, { message: "Cantidad de ingrediente inválida" }); }
    if (!Number.isInteger(ingredient.wastePermille) || ingredient.wastePermille < 0 || ingredient.wastePermille > 999) {
      throw new HTTPException(400, { message: "Merma inválida" });
    }
    if (ingredient.catalogIngredientId != null && typeof ingredient.catalogIngredientId !== "string") {
      throw new HTTPException(400, { message: "Vínculo de stock inválido" });
    }
  });
  if (!Array.isArray(data.steps) || data.steps.length > 200) throw new HTTPException(400, { message: "Pasos inválidos" });
  data.steps.forEach((step) => {
    if (!step || typeof step.title !== "string" || !step.title.trim() || step.title.length > 200 ||
      typeof step.instruction !== "string" || step.instruction.length > 5000 ||
      !Array.isArray(step.ingredientIndexes) ||
      !step.ingredientIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < data.ingredients!.length)) {
      throw new HTTPException(400, { message: "Paso inválido" });
    }
  });
  if (data.course != null && !cleanCourse(data.course)) throw new HTTPException(400, { message: "Curso inválido" });
  return data as RecipeInput;
}

async function kitchenCourses(db: D1Database, kitchenId: string) {
  const rows = await db.prepare("SELECT name FROM kitchen_courses WHERE kitchen_id = ? ORDER BY position").bind(kitchenId).all<{ name: string }>();
  return mergeCourses(rows.results.map((row) => row.name));
}

type CatalogRow = { id: string; name: string; base_unit: StockUnit };

async function kitchenCatalog(db: D1Database, kitchenId: string) {
  const rows = await db.prepare("SELECT id, name, base_unit FROM catalog_ingredients WHERE kitchen_id = ? AND archived_at IS NULL")
    .bind(kitchenId).all<CatalogRow>();
  return rows.results;
}

/** Explicit link must exist in this kitchen and share a unit family; otherwise an exact name match links automatically. */
function resolveCatalogLink(catalog: CatalogRow[], ingredient: IngredientInput): string | null {
  if (ingredient.catalogIngredientId) {
    const match = catalog.find((row) => row.id === ingredient.catalogIngredientId);
    if (!match) throw new HTTPException(400, { message: `${ingredient.name}: ingrediente de stock inexistente` });
    if (!compatibleStockUnit(ingredient.unit, match.base_unit)) {
      throw new HTTPException(400, { message: `${ingredient.name}: la unidad ${ingredient.unit} no se puede convertir a ${match.base_unit}` });
    }
    return match.id;
  }
  const name = ingredient.name.trim().toLocaleLowerCase("es");
  const match = catalog.find((row) => row.name.toLocaleLowerCase("es") === name && compatibleStockUnit(ingredient.unit, row.base_unit));
  return match?.id ?? null;
}

async function readableRecipe(db: D1Database, kitchenId: string, recipeId: string, userId: string) {
  return db.prepare(
    `SELECT r.id, r.title, r.visibility, r.owner_user_id, r.current_version
     FROM recipes r
     WHERE r.id = ? AND r.kitchen_id = ? AND r.archived_at IS NULL
       AND (r.owner_user_id = ? OR r.visibility = 'kitchen'
            OR EXISTS (SELECT 1 FROM recipe_access a WHERE a.recipe_id = r.id AND a.user_id = ?))`,
  ).bind(recipeId, kitchenId, userId, userId).first<{
    id: string; title: string; visibility: string; owner_user_id: string; current_version: number;
  }>();
}

function canManage(role: KitchenRole) { return role === "chef" || role === "sous_chef"; }

export function registerRecipeRoutes(app: App) {
  app.get("/api/kitchens/:kitchenId/courses", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    await requireMember(context, kitchenId);
    return context.json({ courses: await kitchenCourses(context.env.DB, kitchenId) });
  });

  app.post("/api/kitchens/:kitchenId/courses", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: { name?: unknown };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const name = cleanCourse(body.name);
    if (!name) throw new HTTPException(400, { message: "Escribí un nombre de hasta 60 caracteres" });
    const courses = await kitchenCourses(context.env.DB, kitchenId);
    if (courses.some((course) => courseKey(course) === courseKey(name))) throw new HTTPException(409, { message: "Ese curso ya existe" });
    if (courses.length >= 20) throw new HTTPException(400, { message: "Máximo 20 cursos" });
    await context.env.DB.prepare("INSERT INTO kitchen_courses (kitchen_id, name, position) VALUES (?, ?, ?)").bind(kitchenId, name, courses.length).run();
    return context.json({ courses: [...courses, name] }, 201);
  });

  app.put("/api/kitchens/:kitchenId/recipes/:recipeId/course", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const recipe = await readableRecipe(context.env.DB, kitchenId, context.req.param("recipeId"), actor.userId);
    if (!recipe) throw new HTTPException(404, { message: "Receta no encontrada" });
    if (recipe.owner_user_id !== actor.userId && !canManage(actor.role)) {
      throw new HTTPException(403, { message: "Solo el autor o la jefatura pueden cambiar el curso" });
    }
    let body: { course?: unknown };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const course = body.course == null ? null : cleanCourse(body.course);
    if (body.course != null && !course) throw new HTTPException(400, { message: "Curso inválido" });
    await context.env.DB.prepare("UPDATE recipes SET course = ? WHERE id = ?").bind(course, recipe.id).run();
    return context.json({ course });
  });

  app.get("/api/kitchens/:kitchenId/recipes", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const result = await context.env.DB.prepare(
      `SELECT r.id, r.title, r.visibility, r.current_version, r.owner_user_id, r.course,
        v.id AS version_id, v.yield_milli, v.yield_unit
       FROM recipes r JOIN recipe_versions v ON v.recipe_id = r.id AND v.version = r.current_version
       WHERE r.kitchen_id = ? AND r.archived_at IS NULL
         AND (r.owner_user_id = ? OR r.visibility = 'kitchen'
           OR EXISTS (SELECT 1 FROM recipe_access a WHERE a.recipe_id = r.id AND a.user_id = ?))
       ORDER BY r.created_at DESC`,
    ).bind(kitchenId, actor.userId, actor.userId).all();
    return context.json({ recipes: result.results });
  });

  app.post("/api/kitchens/:kitchenId/recipes", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    let raw: unknown;
    try { raw = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const input = validateInput(raw);
    const catalog = await kitchenCatalog(context.env.DB, kitchenId);
    const links = input.ingredients.map((ingredient) => resolveCatalogLink(catalog, ingredient));
    const recipeId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const ingredientIds = input.ingredients.map(() => crypto.randomUUID());
    const stepIds = input.steps.map(() => crypto.randomUUID());
    const statements: D1PreparedStatement[] = [
      context.env.DB.prepare("INSERT INTO recipes (id, kitchen_id, owner_user_id, title, course) VALUES (?, ?, ?, ?, ?)").bind(recipeId, kitchenId, actor.userId, input.title.trim(), cleanCourse(input.course)),
      context.env.DB.prepare(
        "INSERT INTO recipe_versions (id, recipe_id, version, description, yield_milli, yield_unit, confirmed_by_user_id) VALUES (?, ?, 1, ?, ?, ?, ?)",
      ).bind(versionId, recipeId, input.description.trim(), input.yieldMilli, input.yieldUnit, actor.userId),
    ];
    input.ingredients.forEach((ingredient, index) => {
      statements.push(context.env.DB.prepare(
        "INSERT INTO recipe_ingredients (id, version_id, ingredient_name, net_milli, unit, waste_permille, position, catalog_ingredient_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(ingredientIds[index], versionId, ingredient.name.trim(), ingredient.netMilli, ingredient.unit, ingredient.wastePermille, index, links[index]));
    });
    input.steps.forEach((step, index) => {
      statements.push(context.env.DB.prepare(
        "INSERT INTO recipe_steps (id, version_id, title, instruction, position) VALUES (?, ?, ?, ?, ?)",
      ).bind(stepIds[index], versionId, step.title.trim(), step.instruction.trim(), index));
      step.ingredientIndexes.forEach((ingredientIndex) => {
        statements.push(context.env.DB.prepare("INSERT INTO recipe_step_ingredients (step_id, ingredient_id) VALUES (?, ?)").bind(stepIds[index], ingredientIds[ingredientIndex]));
      });
    });
    await context.env.DB.batch(statements);
    return context.json({ recipeId, versionId }, 201);
  });

  app.get("/api/kitchens/:kitchenId/recipes/:recipeId", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const recipe = await readableRecipe(context.env.DB, kitchenId, context.req.param("recipeId"), actor.userId);
    if (!recipe) throw new HTTPException(404, { message: "Receta no encontrada" });
    const version = await context.env.DB.prepare(
      "SELECT * FROM recipe_versions WHERE recipe_id = ? AND version = ?",
    ).bind(recipe.id, recipe.current_version).first<{ id: string; version: number; description: string; yield_milli: number; yield_unit: Unit }>();
    if (!version) throw new HTTPException(500, { message: "Versión faltante" });
    const [ingredients, steps, connections] = await Promise.all([
      context.env.DB.prepare("SELECT * FROM recipe_ingredients WHERE version_id = ? ORDER BY position").bind(version.id).all(),
      context.env.DB.prepare("SELECT * FROM recipe_steps WHERE version_id = ? ORDER BY position").bind(version.id).all(),
      context.env.DB.prepare(
        "SELECT c.step_id, c.ingredient_id FROM recipe_step_ingredients c JOIN recipe_steps s ON s.id = c.step_id WHERE s.version_id = ?",
      ).bind(version.id).all<{ step_id: string; ingredient_id: string }>(),
    ]);
    const value: RecipeVersion = {
      id: version.id, recipeId: recipe.id, version: version.version, title: recipe.title,
      description: version.description, yieldMilli: version.yield_milli, yieldUnit: version.yield_unit,
      confirmedByChef: true,
      ingredients: (ingredients.results as Array<Record<string, unknown>>).map((item) => ({
        id: item.id as string, name: item.ingredient_name as string, netMilli: item.net_milli as number,
        unit: item.unit as Unit, wastePermille: item.waste_permille as number,
        catalogIngredientId: (item.catalog_ingredient_id as string | null) ?? null,
      })),
      steps: (steps.results as Array<Record<string, unknown>>).map((item) => ({
        id: item.id as string, title: item.title as string, instruction: item.instruction as string,
        ingredientIds: connections.results.filter((link) => link.step_id === item.id).map((link) => link.ingredient_id),
      })),
    };
    return context.json({ recipe: { id: recipe.id, ownerUserId: recipe.owner_user_id, visibility: recipe.visibility }, version: value });
  });

  app.put("/api/kitchens/:kitchenId/recipes/:recipeId/ingredients/:ingredientId/catalog", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const recipe = await readableRecipe(context.env.DB, kitchenId, context.req.param("recipeId"), actor.userId);
    if (!recipe) throw new HTTPException(404, { message: "Receta no encontrada" });
    if (recipe.owner_user_id !== actor.userId && !canManage(actor.role)) {
      throw new HTTPException(403, { message: "Solo el autor o la jefatura pueden vincular stock" });
    }
    const ingredient = await context.env.DB.prepare(
      `SELECT ri.id, ri.ingredient_name, ri.unit FROM recipe_ingredients ri
       JOIN recipe_versions v ON v.id = ri.version_id WHERE ri.id = ? AND v.recipe_id = ?`,
    ).bind(context.req.param("ingredientId"), recipe.id).first<{ id: string; ingredient_name: string; unit: Unit }>();
    if (!ingredient) throw new HTTPException(404, { message: "Ingrediente no encontrado" });
    let body: { catalogIngredientId?: string | null };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    let link: string | null = null;
    if (body.catalogIngredientId) {
      link = resolveCatalogLink(await kitchenCatalog(context.env.DB, kitchenId), {
        name: ingredient.ingredient_name, unit: ingredient.unit, netMilli: 1, wastePermille: 0, catalogIngredientId: body.catalogIngredientId,
      });
    }
    await context.env.DB.prepare("UPDATE recipe_ingredients SET catalog_ingredient_id = ? WHERE id = ?").bind(link, ingredient.id).run();
    return context.json({ ingredientId: ingredient.id, catalogIngredientId: link });
  });

  app.put("/api/kitchens/:kitchenId/recipes/:recipeId/sharing", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const recipe = await context.env.DB.prepare("SELECT owner_user_id FROM recipes WHERE id = ? AND kitchen_id = ?")
      .bind(context.req.param("recipeId"), kitchenId).first<{ owner_user_id: string }>();
    if (!recipe) throw new HTTPException(404, { message: "Receta no encontrada" });
    if (recipe.owner_user_id !== actor.userId) throw new HTTPException(403, { message: "Solo el autor puede compartir" });
    const body = await context.req.json<{ visibility?: "private" | "kitchen" }>();
    if (body.visibility !== "private" && body.visibility !== "kitchen") throw new HTTPException(400, { message: "Visibilidad inválida" });
    await context.env.DB.prepare("UPDATE recipes SET visibility = ? WHERE id = ?").bind(body.visibility, context.req.param("recipeId")).run();
    return context.json({ visibility: body.visibility });
  });

  app.post("/api/kitchens/:kitchenId/recipes/:recipeId/access", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const recipe = await context.env.DB.prepare("SELECT owner_user_id FROM recipes WHERE id = ? AND kitchen_id = ?")
      .bind(context.req.param("recipeId"), kitchenId).first<{ owner_user_id: string }>();
    if (!recipe) throw new HTTPException(404, { message: "Receta no encontrada" });
    if (recipe.owner_user_id !== actor.userId) throw new HTTPException(403, { message: "Solo el autor puede compartir" });
    const body = await context.req.json<{ userId?: string }>();
    if (!body.userId || body.userId === actor.userId) throw new HTTPException(400, { message: "Integrante inválido" });
    const member = await context.env.DB.prepare(
      "SELECT 1 FROM memberships WHERE kitchen_id = ? AND user_id = ? AND status = 'active'",
    ).bind(kitchenId, body.userId).first();
    if (!member) throw new HTTPException(404, { message: "Integrante no encontrado" });
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO recipe_access (recipe_id, user_id, granted_by_user_id) VALUES (?, ?, ?)",
    ).bind(context.req.param("recipeId"), body.userId, actor.userId).run();
    return context.json({ access: "read" }, 201);
  });

  app.delete("/api/kitchens/:kitchenId/recipes/:recipeId/access/:userId", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const recipe = await context.env.DB.prepare("SELECT owner_user_id FROM recipes WHERE id = ? AND kitchen_id = ?")
      .bind(context.req.param("recipeId"), kitchenId).first<{ owner_user_id: string }>();
    if (!recipe) throw new HTTPException(404, { message: "Receta no encontrada" });
    if (recipe.owner_user_id !== actor.userId) throw new HTTPException(403, { message: "Solo el autor puede cambiar el acceso" });
    await context.env.DB.prepare("DELETE FROM recipe_access WHERE recipe_id = ? AND user_id = ?")
      .bind(context.req.param("recipeId"), context.req.param("userId")).run();
    return context.body(null, 204);
  });
}
