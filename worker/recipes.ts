import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { assertPositiveMilli, type RecipeVersion, type Unit } from "../shared/kitchen";
import type { AuthBindings } from "./auth";
import { requireMember } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;
const units = new Set<Unit>(["g", "kg", "ml", "L", "un", "atado", "paq", "bandeja", "porción"]);

type IngredientInput = { name: string; netMilli: number; unit: Unit; wastePermille: number };
type StepInput = { title: string; instruction: string; ingredientIndexes: number[] };
type RecipeInput = {
  title: string;
  description: string;
  yieldMilli: number;
  yieldUnit: Unit;
  ingredients: IngredientInput[];
  steps: StepInput[];
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
  });
  if (!Array.isArray(data.steps) || !data.steps.length || data.steps.length > 200) throw new HTTPException(400, { message: "Pasos inválidos" });
  data.steps.forEach((step) => {
    if (!step || typeof step.title !== "string" || !step.title.trim() || step.title.length > 200 ||
      typeof step.instruction !== "string" || step.instruction.length > 5000 ||
      !Array.isArray(step.ingredientIndexes) ||
      !step.ingredientIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < data.ingredients!.length)) {
      throw new HTTPException(400, { message: "Paso inválido" });
    }
  });
  return data as RecipeInput;
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

export function registerRecipeRoutes(app: App) {
  app.get("/api/kitchens/:kitchenId/recipes", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const result = await context.env.DB.prepare(
      `SELECT r.id, r.title, r.visibility, r.current_version, r.owner_user_id,
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
    const recipeId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const ingredientIds = input.ingredients.map(() => crypto.randomUUID());
    const stepIds = input.steps.map(() => crypto.randomUUID());
    const statements: D1PreparedStatement[] = [
      context.env.DB.prepare("INSERT INTO recipes (id, kitchen_id, owner_user_id, title) VALUES (?, ?, ?, ?)").bind(recipeId, kitchenId, actor.userId, input.title.trim()),
      context.env.DB.prepare(
        "INSERT INTO recipe_versions (id, recipe_id, version, description, yield_milli, yield_unit, confirmed_by_user_id) VALUES (?, ?, 1, ?, ?, ?, ?)",
      ).bind(versionId, recipeId, input.description.trim(), input.yieldMilli, input.yieldUnit, actor.userId),
    ];
    input.ingredients.forEach((ingredient, index) => {
      statements.push(context.env.DB.prepare(
        "INSERT INTO recipe_ingredients (id, version_id, ingredient_name, net_milli, unit, waste_permille, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(ingredientIds[index], versionId, ingredient.name.trim(), ingredient.netMilli, ingredient.unit, ingredient.wastePermille, index));
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
      })),
      steps: (steps.results as Array<Record<string, unknown>>).map((item) => ({
        id: item.id as string, title: item.title as string, instruction: item.instruction as string,
        ingredientIds: connections.results.filter((link) => link.step_id === item.id).map((link) => link.ingredient_id),
      })),
    };
    return context.json({ recipe: { id: recipe.id, ownerUserId: recipe.owner_user_id, visibility: recipe.visibility }, version: value });
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
