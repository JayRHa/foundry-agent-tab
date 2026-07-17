/**
 * Foundry Agent Tab — backend
 *
 * Two jobs, and deliberately nothing else:
 *   1. Keep the Foundry credential on the server. A Teams tab is a browser page;
 *      anything it holds, the user holds. No key, no token, no endpoint secret.
 *   2. Translate the Foundry Responses API into a small, boring surface for the tab:
 *        GET  /api/agents        -> the agents this project exposes
 *        POST /api/chat          -> Server-Sent Events: tokens, tool calls, citations
 *
 * Auth uses DefaultAzureCredential, so the same code runs with `az login` on your
 * laptop and with a managed identity in App Service. Chapter 13 explains why there is
 * no API key anywhere in this file.
 */
import express from "express";
import { DefaultAzureCredential } from "@azure/identity";

const PORT = process.env.PORT || 3978;
const PROJECT_ENDPOINT = (process.env.FOUNDRY_PROJECT_ENDPOINT || "").replace(/\/$/, "");
const API_VERSION = process.env.FOUNDRY_API_VERSION || "v1";
const SCOPE = "https://ai.azure.com/.default";

if (!PROJECT_ENDPOINT) {
  console.error("FOUNDRY_PROJECT_ENDPOINT is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const credential = new DefaultAzureCredential();
let cachedToken = null;

/** Reuse the bearer token until a minute before it expires. */
async function getToken() {
  if (cachedToken && cachedToken.expiresOnTimestamp - Date.now() > 60_000) {
    return cachedToken.token;
  }
  cachedToken = await credential.getToken(SCOPE);
  if (!cachedToken) throw new Error("Could not acquire a token for " + SCOPE);
  return cachedToken.token;
}

/**
 * Two surfaces live under one project endpoint, and they do not agree on versioning:
 *   /agents           -> control surface, wants ?api-version=v1
 *   /openai/v1/...    -> the OpenAI-compatible surface, rejects api-version outright
 *                        ("api-version=v1 is not allowed. Use /v1 path instead.")
 * Passing `openai: true` picks the second one.
 */
async function foundry(path, init = {}, openai = false) {
  const token = await getToken();
  const url = openai
    ? `${PROJECT_ENDPOINT}/openai/v1${path}`
    : `${PROJECT_ENDPOINT}${path}${path.includes("?") ? "&" : "?"}api-version=${API_VERSION}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  return res;
}

/**
 * Turn a Foundry error into something a human can act on.
 * The status codes matter and the book leans on them: 401 is the token, 403 is the
 * role, 429 is quota, 400 with content_filter is the guardrail doing its job.
 */
function explain(status, body) {
  const code = body?.error?.code || "";
  if (status === 401) return "Not signed in to Azure, or the token is for the wrong scope.";
  if (status === 403) return "Signed in, but this identity has no Foundry role on the project.";
  if (status === 404) return "Agent or project not found. Check FOUNDRY_PROJECT_ENDPOINT and the agent name.";
  if (status === 429) return "Rate limited or out of quota. Wait for Retry-After and try again.";
  if (code === "content_filter") return "A guardrail blocked this prompt before the model saw it.";
  return body?.error?.message || `Foundry returned HTTP ${status}.`;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(new URL("../app", import.meta.url).pathname));

app.get("/api/health", (_req, res) => res.json({ ok: true, endpoint: PROJECT_ENDPOINT }));

/** GET /api/agents — the picker in the sidebar is built from this. */
app.get("/api/agents", async (_req, res) => {
  try {
    const r = await foundry("/agents");
    const body = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: explain(r.status, body) });

    const agents = (body.data || [])
      .filter((a) => a.state !== "disabled")
      .map((a) => {
        const latest = a.versions?.latest || {};
        const def = latest.definition || {};
        return {
          name: a.name || a.id,
          version: latest.version ?? null,
          description: latest.description || "",
          instructions: def.instructions || "",
          model: def.model || "",
          tools: (def.tools || []).map((t) => t.type).filter(Boolean),
          kind: def.kind || "prompt",
        };
      });
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chat { agent, message, conversation }
 * Streams Server-Sent Events to the tab:
 *   token        {delta}                 a piece of the answer
 *   tool         {name}                  a tool the service actually ran
 *   citation     {title, url}            a source behind the answer
 *   done         {conversation, usage}   end of turn
 *   error        {message}               human-readable failure
 *
 * Conversations are server-side state in Foundry: we hand back the id and the tab
 * sends it with the next turn. The tab never stores history itself.
 */
app.post("/api/chat", async (req, res) => {
  const { agent, message, conversation } = req.body || {};
  if (!agent || !message) return res.status(400).json({ error: "agent and message are required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    let conversationId = conversation;
    if (!conversationId) {
      const c = await foundry("/conversations", { method: "POST", body: JSON.stringify({}) }, true);
      const cb = await c.json();
      if (!c.ok) throw Object.assign(new Error(explain(c.status, cb)), { status: c.status });
      conversationId = cb.id;
    }

    const r = await foundry("/responses", {
      method: "POST",
      body: JSON.stringify({
        // `agent` is deprecated and rejected; it is `agent_reference`, and `type` is
        // required inside it. The service tells you both, but only one at a time.
        agent_reference: { name: agent, type: "agent_reference" },
        conversation: conversationId,
        input: [{ role: "user", content: message }],
        stream: true,
      }),
    }, true);

    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw Object.assign(new Error(explain(r.status, body)), { status: r.status });
    }

    const seenTools = new Set();
    const seenCitations = new Set();
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";

      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let evt;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }

        if (evt.type === "response.output_text.delta" && evt.delta) {
          send("token", { delta: evt.delta });
        }

        // Tool activity: the service runs tools itself, so this is how the tab
        // learns which ones ran. Chapter 7 shows why that matters.
        const itemType = evt.item?.type || "";
        if (evt.type === "response.output_item.added" && itemType.endsWith("_call")) {
          const name = evt.item.name || itemType.replace(/_call$/, "");
          if (!seenTools.has(name)) {
            seenTools.add(name);
            send("tool", { name });
          }
        }

        if (evt.type === "response.completed" || evt.type === "response.done") {
          usage = evt.response?.usage || usage;
          for (const item of evt.response?.output || []) {
            for (const part of item.content || []) {
              for (const ann of part.annotations || []) {
                const url = ann.url || ann.file_citation?.file_id;
                if (!url || seenCitations.has(url)) continue;
                seenCitations.add(url);
                send("citation", { title: ann.title || url, url: ann.url || null });
              }
            }
          }
        }
      }
    }

    send("done", { conversation: conversationId, usage });
  } catch (err) {
    send("error", { message: err.message, status: err.status || 500 });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Foundry Agent Tab on http://localhost:${PORT}`);
  console.log(`Project: ${PROJECT_ENDPOINT}`);
});
