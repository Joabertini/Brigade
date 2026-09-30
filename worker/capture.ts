import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { extractJson, normalizeDraft } from "../shared/capture";
import type { AuthBindings } from "./auth";
import { requireMember } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;
export const CAPTURE_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
/** Models allowed for comparison runs; production uses CAPTURE_MODEL. */
const candidates = new Set([CAPTURE_MODEL, "@cf/qwen/qwen3.8-27b", "@cf/openai/gpt-oss-120b", "@cf/moonshotai/kimi-k2.6", "@cf/zai-org/glm-5.3", "@cf/deepseek-ai/deepseek-v4-pro-0813", "@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/google/gemma-4-26b-a4b-it"]);

/** Models that need Workers AI JSON mode to return parseable output. */
const jsonMode = new Set(["@cf/meta/llama-3.3-70b-instruct-fp8-fast"]);

const instructions = `Sos asistente de una cocina profesional en Uruguay. Recibís el texto de una receta tal como la escribió un cocinero (mensaje, nota o cuaderno) y la pasás a JSON.
Reglas:
- En title, yield, ingredients y steps copiá solo lo que dice el texto. Nunca inventes ingredientes ni cantidades. Lo que propongas vos va únicamente en "suggestedSteps".
- Abreviaturas de cocina: "p/" = para, "c/" = con, "s/" = sin, "c/n" = cantidad necesaria, "cda" = cucharada, "cdita" = cucharadita, "porc" = porciones.
- Cantidades con punto o coma decimal: "1.250k" o "1,250 kg" son 1.25 kg. "k" significa kg.
- Unidades válidas: g, kg, ml, L, un, atado, paq, bandeja, porción. Si no hay unidad, dejá unit en null.
- "source" es el fragmento exacto del texto de donde sale cada dato.
- yield es el rendimiento TOTAL de la receta. Un peso por pieza ("pancitos de 30 g") no es el rendimiento: dejá yield en null y preguntá.
- "steps" contiene SOLO los pasos que están en el texto, separados en un paso por acción ("rehogar ajo sin dorar, agregar tomate" son dos pasos), con un título corto de una o dos palabras. No agregues nada que el texto no diga. Si el texto no trae procedimiento, "steps" queda vacío y en "suggestedSteps" proponés un procedimiento profesional, claro y breve, usando solo los ingredientes listados, con técnicas estándar para ese tipo de preparación (tiempos y temperaturas orientativos). Si el texto trae un procedimiento completo, "suggestedSteps" queda vacío. Si lo trae incompleto (por ejemplo solo la cocción), en "suggestedSteps" proponé el procedimiento completo respetando exactamente lo que dice el texto (tiempos, temperaturas, técnicas).
- Solo si el texto TRAE procedimiento y un ingrediente listado no aparece en ningún paso (por ejemplo "2 kg cebolla y sal" y ningún paso nombra la sal), preguntá en qué momento se agrega (topic "other"), con opciones concretas que tengan sentido para esa preparación. Si no hay procedimiento, no preguntes por momentos: eso lo resuelve el procedimiento.
- Si una cantidad sin unidad sigue a otra del mismo ingrediente ("200 g azúcar + 150 p/caramelo"), usá la misma unidad y un nombre que las distinga ("azúcar", "azúcar para caramelo").
- "c/n", "a gusto" o "cantidad necesaria": amount y unit en null, y preguntá la cantidad con opciones concretas.
- Hacé preguntas SOLO sobre lo ambiguo o faltante que cambie cantidades o técnica: rendimiento, cantidades sin número o sin unidad, el momento de agregar un ingrediente cuando no está claro, peso bruto o neto de algo que se limpia. NO preguntes por tipo, marca, variedad, calidad ni temperatura de un ingrediente, ni lo que el texto ya dice. Máximo 4 preguntas, cada una con 2 a 4 opciones cortas y concretas. Si no hay dudas reales, "questions" queda vacío.
Respondé solo con JSON, sin texto extra, con esta forma:
{"title": string, "yield": {"amount": number|null, "unit": string|null, "source": string}, "ingredients": [{"name": string, "amount": number|null, "unit": string|null, "source": string}], "steps": [{"title": string, "instruction": string}], "suggestedSteps": [{"title": string, "instruction": string}], "questions": [{"topic": "yield"|"ingredient"|"steps"|"other", "ingredientIndex": number|null, "source": string, "question": string, "options": [string]}]}`;

export function registerCaptureRoutes(app: App) {
  app.post("/api/kitchens/:kitchenId/recipes/interpret", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    await requireMember(context, kitchenId);
    let body: { text?: string; model?: string };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const source = body.text?.trim() ?? "";
    if (!source || source.length > 8000) throw new HTTPException(400, { message: "Pegá entre 1 y 8000 caracteres" });
    if (!context.env.AI) throw new HTTPException(503, { message: "Interpretación no disponible" });
    const model = body.model && candidates.has(body.model) ? body.model : CAPTURE_MODEL;
    let reply: string;
    try {
      const result = await context.env.AI.run(model as keyof AiModels, {
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: model.startsWith("@cf/qwen/qwen3") ? `${source}\n\n/no_think` : source },
        ],
        max_tokens: 4000,
        temperature: 0.1,
        ...(jsonMode.has(model) ? { response_format: { type: "json_object" } } : {}),
      }) as { response?: unknown; choices?: { message?: { content?: string } }[] };
      const raw = result.response ?? result.choices?.[0]?.message?.content;
      reply = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
    } catch (cause) {
      console.error("capture model failed", cause);
      throw new HTTPException(502, { message: "No se pudo interpretar el texto. Probá de nuevo." });
    }
    try {
      return context.json({ draft: normalizeDraft(extractJson(reply), source), model });
    } catch (cause) {
      console.error("capture parse failed", cause, reply.slice(0, 500));
      throw new HTTPException(502, { message: "El modelo devolvió una respuesta ilegible. Probá de nuevo." });
    }
  });
}
