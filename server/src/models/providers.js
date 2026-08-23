// server/src/models/providers.js
//
// Provider profiles for the one orchestrator — CONTRACT.md §16.2.
//
// WHY THIS FILE EXISTS. §16.2 says "every hosted-model call in the system goes
// through one orchestrator", and orchestrator.js is that call site. It is not a
// statement about how many PROVIDERS the system may speak to — only about how
// many places may open a socket. Before this file, the transport carried one
// hardcoded vendor branch (`base.includes('bedrock-runtime')`) which worked
// while there was exactly one exception to the OpenAI shape. Three targets
// (Gemini, Grok, Qwen) is where a chain of `includes()` checks stops being a
// special case and starts being an unwritten registry, so this is the written
// one.
//
// WHAT A PROFILE IS. A description of how one vendor's OpenAI-compatible
// endpoint DIFFERS from the OpenAI shape — nothing else. Every provider here
// speaks `POST {base}/chat/completions` with a Bearer token and OpenAI message
// objects; a profile records only the deltas.
//
// THIS MODULE HOLDS NO CREDENTIALS AND OPENS NO SOCKETS. It has no `fetch`, no
// key, and no environment read. Everything it needs is passed in by
// orchestrator.js, which stays the single module permitted to read the
// credential variables. tests/model-orchestrator.test.mjs greps for exactly
// that, and this file must keep passing it.
//
// NO PROVIDER SDK IS IMPORTED, HERE OR ANYWHERE. The same test suite forbids
// `@google/generative-ai`, `openai`, `cohere-ai` and friends outside the one
// call site. Each vendor below publishes an OpenAI-compatible HTTP route, so
// plain `fetch` against a documented URL reaches all three with no dependency,
// no vendor lock, and no second retry budget hiding inside somebody's client.
//
// WHY STRUCTURED OUTPUT IS A PER-PROVIDER FIELD. It is the one place the three
// genuinely disagree. OpenAI and xAI honour `json_schema` with `strict: true`.
// Gemini's compatibility layer accepts `json_schema` but rejects a schema
// carrying keywords its converter does not model, and `strict` is not part of
// its contract. DashScope's compatible mode serves models that offer only
// `json_object` — a mode that constrains syntax and says nothing about shape.
//
// THAT LAST CASE IS SAFE, AND THE REASON IS ORCHESTRATOR-SIDE. §16.2 requires
// the response to be validated against the caller's schema before it is
// returned, and orchestrator.js does that for every provider regardless of
// what the request asked for. So a provider that can only promise "some JSON"
// is not a correctness hole: it is a provider whose first attempt fails schema
// validation more often and spends the one permitted retry. Degraded, not
// unsound. What would be unsound is trusting `json_schema` to have been
// enforced and skipping the check.

/** How a provider can be asked for machine-readable output. */
export const STRUCTURED = {
  /** `json_schema` with `strict: true` — the shape is enforced provider-side. */
  SCHEMA_STRICT: 'schema-strict',
  /** `json_schema` without `strict` — honoured on a best-effort basis. */
  SCHEMA_LOOSE: 'schema-loose',
  /** `json_object` only — valid JSON is promised, the shape is not. */
  JSON_OBJECT: 'json-object',
  /** Nothing beyond the prompt. The schema is described in words. */
  PROMPT_ONLY: 'prompt-only',
};

/**
 * The registry.
 *
 * `baseUrl` is a DEFAULT, not a lock. An explicitly configured base always
 * wins, because these hosts change and a stale constant compiled into the
 * repository is worse than one the operator can override.
 */
export const PROVIDERS = {
  // The generic profile, and the fallback for any base URL we do not recognise.
  // Assumes the plain OpenAI contract because that is what "OpenAI-compatible"
  // means when a vendor claims it without further qualification.
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI-compatible endpoint',
    baseUrl: null,
    structured: STRUCTURED.SCHEMA_STRICT,
    supportsVision: true,
    supportsSystemRole: true,
  },

  // Measured working against qwen.qwen3-coder-next and qwen.qwen3-vl-235b-a22b
  // — B-005 in docs/BENCHMARK-RESULTS.md. The route carries the model in the
  // PATH rather than the body, which is the only reason this needs a profile.
  bedrock: {
    id: 'bedrock',
    label: 'AWS Bedrock (OpenAI-compatible route)',
    baseUrl: null, // region-specific; the operator must supply it
    structured: STRUCTURED.SCHEMA_STRICT,
    supportsVision: true,
    supportsSystemRole: true,
    pathStyle: 'bedrock-invoke',
  },

  // Google's OpenAI compatibility layer. Documented at
  // https://generativelanguage.googleapis.com/v1beta/openai/ and authenticated
  // with a normal Bearer token, so no Google SDK is needed or permitted.
  //
  // SCHEMA_LOOSE, not SCHEMA_STRICT, and this is deliberate: the layer maps the
  // supplied JSON Schema onto Gemini's own response-schema type, which models a
  // strict subset of JSON Schema. A schema using a keyword outside that subset
  // is rejected outright — a 4xx, which §16.2 forbids retrying, so the call
  // fails permanently rather than degrading. Asking without `strict` keeps the
  // request inside the subset the converter reliably handles and leaves
  // enforcement to the orchestrator's own validation, which runs anyway.
  gemini: {
    id: 'gemini',
    label: 'Google Gemini (OpenAI-compatible route)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    structured: STRUCTURED.SCHEMA_LOOSE,
    supportsVision: true,
    supportsSystemRole: true,
  },

  // xAI's Grok. Its API is an intentionally close OpenAI clone — same paths,
  // same auth, same structured-output contract — so this profile differs from
  // the generic one only in carrying a default host.
  xai: {
    id: 'xai',
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    structured: STRUCTURED.SCHEMA_STRICT,
    supportsVision: true,
    supportsSystemRole: true,
  },

  // Alibaba's DashScope compatible mode, which is how a hosted Qwen (including
  // the Qwen-VL vision models this pipeline's critic wants) is reached without
  // an SDK.
  //
  // JSON_OBJECT because coverage across the Qwen line is uneven: some models on
  // this route accept a full response schema and some accept only "reply with
  // JSON". Declaring the weaker capability is the safe direction — a provider
  // that quietly ignores an unsupported field returns prose, which fails schema
  // validation and burns the single retry, whereas asking for less than the
  // model can do costs nothing but a slightly less constrained first attempt.
  dashscope: {
    id: 'dashscope',
    label: 'Alibaba DashScope (Qwen, OpenAI-compatible mode)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    structured: STRUCTURED.JSON_OBJECT,
    supportsVision: true,
    supportsSystemRole: true,
  },

  // A locally served model — Ollama, vLLM, LM Studio, llama.cpp. All of them
  // expose the OpenAI route on localhost, and none of them need a real key,
  // which is why this exists as a named profile rather than as advice to use
  // the generic one: it documents that the deterministic-path rule (AGENTS.md
  // rule 5) has a supported middle ground between "no model" and "somebody
  // else's cloud". PROMPT_ONLY because structured-output support across local
  // runtimes is the least consistent of any row here.
  local: {
    id: 'local',
    label: 'Local OpenAI-compatible server (Ollama, vLLM, LM Studio)',
    baseUrl: 'http://localhost:11434/v1',
    structured: STRUCTURED.PROMPT_ONLY,
    supportsVision: true,
    supportsSystemRole: true,
  },
};

export const DEFAULT_PROVIDER = 'openai-compatible';

/**
 * Aliases, so an operator writing the name they actually say out loud gets the
 * right profile. "Which one is DashScope?" is not a question anybody should
 * have to answer to point this at Qwen.
 */
const ALIASES = {
  google: 'gemini',
  'google-gemini': 'gemini',
  googleai: 'gemini',
  grok: 'xai',
  'x.ai': 'xai',
  qwen: 'dashscope',
  alibaba: 'dashscope',
  aliyun: 'dashscope',
  openai: 'openai-compatible',
  compatible: 'openai-compatible',
  aws: 'bedrock',
  ollama: 'local',
  vllm: 'local',
  lmstudio: 'local',
};

/**
 * Recognise a provider from its base URL, for configurations that set a host
 * and no provider name.
 *
 * This is a CONVENIENCE, not the mechanism. An explicit provider name always
 * wins. The pre-existing behaviour it preserves is the Bedrock branch that used
 * to live inline in the transport: a base URL containing `bedrock-runtime` has
 * always selected the Bedrock path with nothing else configured, and B-005's
 * measured run depends on that still being true.
 */
export function providerFromBaseUrl(baseUrl) {
  const base = String(baseUrl || '').toLowerCase();
  if (!base) return null;
  if (base.includes('bedrock-runtime')) return 'bedrock';
  if (base.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (base.includes('api.x.ai')) return 'xai';
  if (base.includes('dashscope')) return 'dashscope';
  if (base.includes('localhost') || base.includes('127.0.0.1')) return 'local';
  return null;
}

/**
 * resolveProvider({ provider, baseUrl }) -> { profile, baseUrl }
 *
 * Resolution order, most explicit first:
 *   1. a configured provider name (or one of its aliases),
 *   2. a provider inferred from the configured base URL,
 *   3. the generic OpenAI-compatible profile.
 *
 * The returned `baseUrl` is the configured one when there is one, and the
 * profile's default otherwise. NEVER THROWS on an unknown name: an unrecognised
 * provider degrades to the generic profile with a `warning`, because §16.2's
 * whole posture is that a model path fails soft into the deterministic one. A
 * throw here would crash a request during config resolution, before the
 * orchestrator's own no-key check has had the chance to answer { ok: false }.
 */
export function resolveProvider({ provider, baseUrl } = {}) {
  const requested = String(provider || '').trim().toLowerCase();
  let warning = null;
  let id = null;

  if (requested) {
    id = ALIASES[requested] || (PROVIDERS[requested] ? requested : null);
    if (!id) {
      warning = `unknown model provider "${provider}" — falling back to the generic OpenAI-compatible profile`;
    }
  }

  if (!id) id = providerFromBaseUrl(baseUrl) || DEFAULT_PROVIDER;

  const profile = PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER];
  const resolvedBase = String(baseUrl || '').trim() || profile.baseUrl || '';

  return { profile, baseUrl: resolvedBase, warning };
}

/**
 * The endpoint for one call.
 *
 * Bedrock puts the model in the path and every other profile puts it in the
 * body — that difference, and only that difference, is what `pathStyle` names.
 */
export function endpointFor(profile, baseUrl, model) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (profile.pathStyle === 'bedrock-invoke') {
    return `${base}/model/${encodeURIComponent(model)}/invoke`;
  }
  return `${base}/chat/completions`;
}

/**
 * The `response_format` for one call, given what the provider can honour.
 *
 * Returns `null` when the request should carry no `response_format` at all —
 * which is not the same as an empty object. An unrecognised `response_format`
 * is a 4xx on strict providers, and §16.2 never retries a 4xx, so sending one
 * speculatively converts a soft degradation into a hard failure.
 */
/**
 * Does this schema actually constrain a shape, or does it only name a type?
 *
 * WHY THIS EXISTS — a measured failure, not a hypothetical. critic.js passes
 * `{ type: 'object' }` deliberately: §16.2 requires a caller schema, and the
 * critic's real schema (the IR's) is enforced downstream, so asserting it here
 * too would give two schemas that drift. That is sound reasoning, and handing
 * the bare object to a provider as a `json_schema` response format is not.
 *
 * Measured against gemini-3.5-flash with two images: the same request returns
 * in 2.8s with no response_format, and takes 47s and answers `{}` when
 * `{ type: 'object' }` is sent as a json_schema. The compat layer converts it
 * to a response schema with no fields and then honours it — an empty object is
 * the CORRECT answer to the question we asked. So the critic timed out, and on
 * a slower-but-successful run it would have "corrected" the IR to nothing.
 *
 * A schema with no properties, no items and no composition keywords says only
 * "some JSON object". That is exactly what the JSON_OBJECT rung means, so it is
 * sent as that rather than as an empty shape. Nothing is weakened: §16.2's
 * validation is orchestrator-side and still runs against the caller's schema
 * whatever the request asked for.
 */
export function describesShape(schema) {
  if (!schema || typeof schema !== 'object') return false;
  const keys = ['properties', 'items', 'oneOf', 'anyOf', 'allOf', 'enum', '$ref', 'patternProperties', 'prefixItems'];
  return keys.some((k) => {
    const v = schema[k];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  });
}

export function responseFormatFor(profile, schema) {
  if (!schema) return null;

  // A type-only schema constrains nothing; asking a provider to enforce it is
  // what produced the 47s empty-object reply described on describesShape.
  if (!describesShape(schema)) {
    return profile.structured === STRUCTURED.PROMPT_ONLY ? null : { type: 'json_object' };
  }

  switch (profile.structured) {
    case STRUCTURED.SCHEMA_STRICT:
      return {
        type: 'json_schema',
        json_schema: { name: 'structured_output', strict: true, schema },
      };
    case STRUCTURED.SCHEMA_LOOSE:
      return {
        type: 'json_schema',
        json_schema: { name: 'structured_output', schema },
      };
    case STRUCTURED.JSON_OBJECT:
      return { type: 'json_object' };
    case STRUCTURED.PROMPT_ONLY:
    default:
      return null;
  }
}

/**
 * A system-prompt supplement describing the schema in words, for the providers
 * that cannot be handed one.
 *
 * WHY THE SCHEMA GOES IN THE PROMPT HERE. On a JSON_OBJECT or PROMPT_ONLY
 * provider the orchestrator still validates the reply against the caller's
 * schema, so an unshaped answer is caught — but it is caught by FAILING, and
 * the budget is one retry. Two blind attempts against a model that was never
 * told the shape is the same as no attempts. Describing it costs tokens and
 * turns a guaranteed failure into a likely success.
 *
 * Returns `''` when the provider accepts a real schema, so the caller can
 * append unconditionally.
 */
export function schemaPromptSupplementFor(profile, schema) {
  if (!schema) return '';
  if (profile.structured === STRUCTURED.SCHEMA_STRICT) return '';
  if (profile.structured === STRUCTURED.SCHEMA_LOOSE) return '';

  const rendered = JSON.stringify(schema);
  const preamble =
    profile.structured === STRUCTURED.JSON_OBJECT
      ? 'Reply with a single JSON object and nothing else. It must validate against this JSON Schema:'
      : 'Reply with a single JSON object and nothing else — no prose, no markdown fence. It must validate against this JSON Schema:';
  return `\n\n${preamble}\n${rendered}`;
}

/**
 * Whether a call carrying images can be sent to this provider at all.
 *
 * Every profile currently says yes, because every route above accepts the
 * OpenAI `image_url` content part. The field exists so that adding a
 * text-only endpoint later is a registry edit rather than a bug reported as
 * "the critic silently returned the IR unchanged".
 */
export function acceptsImages(profile) {
  return profile.supportsVision !== false;
}

/**
 * Pull the assistant text out of a completion payload.
 *
 * `content` is a plain string on every provider here TODAY, but the OpenAI
 * schema permits an array of typed parts and Gemini's layer has been observed
 * using it for multi-part replies. Handling both is four lines; debugging
 * "model response carried no message content" against a response that plainly
 * contained content is not.
 *
 * Returns `null` rather than throwing — the caller decides what an empty
 * response means, and for the orchestrator that decision is a retryable
 * transport failure rather than an exception escaping the transport.
 */
export function extractContent(payload) {
  const message = payload?.choices?.[0]?.message;
  if (!message) return null;
  const { content } = message;

  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
    return text || null;
  }

  return null;
}

/**
 * Parse a model's reply as JSON, tolerating a markdown fence.
 *
 * WHY THE FENCE IS STRIPPED HERE RATHER THAN TRUSTED AWAY. A provider on the
 * JSON_OBJECT or PROMPT_ONLY rung has made no promise about fencing, and
 * "```json\n{...}\n```" is the single most common way a model answers a request
 * for JSON. Failing that on a `JSON.parse` would spend the one retry on a reply
 * that was already correct. Providers that enforce a schema never fence, so
 * this costs them one regex that does not match.
 *
 * Throws on genuinely unparseable content, which the orchestrator classifies as
 * a transport failure.
 */
export function parseJsonReply(text) {
  const trimmed = String(text ?? '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}
