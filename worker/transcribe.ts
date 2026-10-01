import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthBindings } from "./auth";
import { requireMember } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;
/** Picked by eval (docs/sesiones/2026-09-30.md): as accurate as the others and the fastest. */
export const TRANSCRIBE_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
/** Same accuracy, a bit slower; used when the main model fails. */
const FALLBACK_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";
/** Models allowed for comparison runs. */
const candidates = new Set([TRANSCRIBE_MODEL, FALLBACK_MODEL, "@cf/google/gemma-4-26b-a4b-it", "@cf/qwen/qwen3.8-27b"]);
const MAX_IMAGE_CHARS = 6_000_000;

const instructions = `Transcribí el texto de esta foto de una receta de cocina, tal como está escrito.
- Copiá cada renglón en su propio renglón, en el mismo orden.
- No corrijas, no completes, no traduzcas ni agregues nada: abreviaturas, números y unidades exactamente como aparecen ("1.250k", "c/n", "p/ 40 porc").
- Si una palabra o número no se lee, escribí [?] en su lugar.
- Ignorá lo que no sea la receta (fondo, marcas de agua, otros objetos).
Respondé solo con el texto transcripto.`;

function readReply(result: unknown): string {
  const value = result as { response?: unknown; answer?: unknown; description?: unknown; choices?: { message?: { content?: unknown } }[] };
  const raw = value.response ?? value.answer ?? value.description ?? value.choices?.[0]?.message?.content;
  return typeof raw === "string" ? raw : "";
}

/** Strips code fences and thinking blocks some models wrap the transcription in. */
export function cleanTranscription(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^```[a-z]*\n?|```$/gm, "").replace(/\r/g, "")
    .split("\n").map((line) => line.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function runModel(ai: Ai, model: string, image: string) {
  const text = model.startsWith("@cf/qwen/qwen3") ? `${instructions}\n/no_think` : instructions;
  return ai.run(model as keyof AiModels, {
    messages: [{ role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: image } }] }],
    max_tokens: 2000, temperature: 0,
  } as never);
}

export function registerTranscribeRoutes(app: App) {
  app.post("/api/kitchens/:kitchenId/recipes/transcribe", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    await requireMember(context, kitchenId);
    let body: { image?: unknown; model?: unknown };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const image = typeof body.image === "string" ? body.image : "";
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE_CHARS) {
      throw new HTTPException(400, { message: "Mandá una foto JPG, PNG o WebP de hasta 4 MB" });
    }
    if (!context.env.AI) throw new HTTPException(503, { message: "Lectura de fotos no disponible" });
    const requested = typeof body.model === "string" && candidates.has(body.model) ? body.model : null;
    let model = requested ?? TRANSCRIBE_MODEL;
    let text = "";
    try {
      text = cleanTranscription(readReply(await runModel(context.env.AI, model, image)));
    } catch (cause) {
      console.error("transcribe model failed", model, cause);
      if (requested) throw new HTTPException(502, { message: "No se pudo leer la foto. Probá de nuevo." });
    }
    if (!text && !requested) {
      model = FALLBACK_MODEL;
      try { text = cleanTranscription(readReply(await runModel(context.env.AI, model, image))); }
      catch (cause) {
        console.error("transcribe fallback failed", cause);
        throw new HTTPException(502, { message: "No se pudo leer la foto. Probá de nuevo." });
      }
    }
    if (!text) throw new HTTPException(422, { message: "No encontramos texto en la foto. Probá con más luz y más cerca." });
    return context.json({ text: text.slice(0, 8000), model });
  });
}
