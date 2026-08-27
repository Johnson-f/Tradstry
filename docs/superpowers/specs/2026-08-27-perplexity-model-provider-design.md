# Perplexity Model Provider Design

**Date:** August 27, 2026
**Status:** Approved in conversation

## Purpose

Add Perplexity as a first-class model provider for Tradstry's TinyAgents runtime. Operators choose exactly one provider through environment configuration. Gemini remains supported without sharing credentials or request formats with Perplexity.

The Perplexity integration uses the Agent API at `POST https://api.perplexity.ai/v1/agent`, authenticates with `PERPLEXITY_API_KEY`, and validates configured model IDs against `GET https://api.perplexity.ai/v1/models`. The adapter implements Tradstry's existing `ChatModel<AgentRuntimeState>` boundary, so routing, specialist permissions, evidence validation, budgets, durable runs, and action approval remain provider-independent.

## Goals

- Select Gemini or Perplexity with one required provider setting.
- Support fast, reasoning, and vision roles plus the existing per-role fallback models.
- Preserve JSON-schema output, custom function tools, streaming, images, usage accounting, cancellation, timeouts, and bounded provider errors.
- Validate every configured Perplexity model ID before workers start.
- Reject video context clearly before a Perplexity request is sent.
- Keep Tradstry's evidence and tool security boundaries unchanged.

## Non-goals

- Selecting different providers per role.
- Routing Google models through Perplexity while Gemini is selected.
- Enabling Perplexity built-in web, finance, people, or URL-fetch tools.
- Using Perplexity presets or Perplexity-managed fallback chains.
- Supporting video through Perplexity before its API documents direct video input.
- Changing the frontend, GraphQL API, database schema, or stored agent message format.

## Configuration

When agents are enabled, `AGENT_MODEL_PROVIDER` is required and accepts only `gemini` or `perplexity`.

```env
AGENTS_V2_ENABLED=true
AGENT_MODEL_PROVIDER=perplexity
PERPLEXITY_API_KEY=pplx-...

AGENT_FAST_MODEL=openai/gpt-5.4-mini
AGENT_REASONING_MODEL=openai/gpt-5.4
AGENT_VISION_MODEL=openai/gpt-5.4
AGENT_FAST_FALLBACK_MODEL=
AGENT_REASONING_FALLBACK_MODEL=
AGENT_VISION_FALLBACK_MODEL=
```

Gemini mode requires only `GEMINI_API_KEY`; Perplexity mode requires only `PERPLEXITY_API_KEY`. The inactive provider's key is neither required nor read. Fallback model IDs always belong to the selected provider.

Production uses fixed provider base URLs. Tests receive an explicit constructor URL so fake HTTP servers can exercise the adapter without adding a production URL override.

## Provider Boundary

Add a `ModelProvider` enum to agent configuration and a provider factory in the runtime model registry. The factory constructs every primary and fallback role from the selected provider:

```text
AgentConfig
  -> ModelProvider
  -> AgentModelRegistry
       -> GeminiModel, or
       -> PerplexityModel
```

Gemini keeps its current adapter. Perplexity gets a separate adapter because Agent API Responses items are not Gemini candidates or parts. Shared orchestration code continues to use only TinyAgents' generic `ChatModel` interface.

`AgentService::from_env` becomes asynchronous so Perplexity catalogue validation completes before the service and workers become available. Tests that inject scripted models continue using `AgentService::from_parts` and remain network-free.

## Perplexity Catalogue Validation

On Perplexity startup:

1. Build a bounded HTTP client using the configured key.
2. Fetch `/v1/models` once with Bearer authentication.
3. Parse the returned model IDs into a set.
4. Confirm every primary and non-empty fallback ID exists.
5. Fail startup with a model-specific configuration error if any ID is absent.

An authentication failure, registry timeout, malformed response, or server error fails startup. Tradstry does not silently run with unvalidated model names and does not change models while running.

The catalogue proves that an ID exists, not that every feature behaves well on that model. A separate opt-in live smoke command certifies the exact deployment models for tools, structured output, streaming, and image input before release.

## Request Translation

The Perplexity adapter converts `ModelRequest` into Agent API input:

- System content becomes `instructions` in original order.
- User text becomes `input_text` message content.
- Assistant text becomes assistant message output content.
- TinyAgents tool calls become `function_call` input items with stable call IDs.
- Tool results become `function_call_output` items tied to those IDs.
- Image data URLs become `input_image` content.
- Gemini provider-extension blocks, including uploaded video references, return an unsupported-media validation error before HTTP.
- `max_tokens`, temperature, top-p, and streaming flags map only when the Agent API supports them.

TinyAgents tool definitions become strict Perplexity function tools. Existing schema preparation remains responsible for bounded names, descriptions, and JSON parameters. Tool choice maps to automatic, none, required, or one named function without expanding the specialist's allowlist.

`ResponseFormat::JsonSchema` becomes Perplexity `response_format.type = "json_schema"`. Schema names are normalized to Perplexity's documented length and character requirements. Returned text is parsed and validated through the same TinyAgents structured-output path used by Gemini before any answer, memory, or action is committed.

## Response and Streaming Translation

Unary responses are parsed from the Agent API `output` array:

- Message text becomes assistant content blocks.
- Function-call items become TinyAgents tool calls; JSON-string arguments must parse as objects.
- Token counts and cache counts become TinyAgents usage.
- The resolved provider model is recorded for observability and cost accounting.
- The bounded original provider payload may be retained only in the existing raw response field; keys and request contents are never logged.

Streaming uses SSE and accepts only documented Agent API events. Text deltas, function-call argument deltas, completion, usage, and provider failures map to existing TinyAgents stream items. Unknown events are ignored unless they make the response incomplete. Buffers and error bodies retain the same hard size limits as the Gemini adapter.

Perplexity built-in search tools are not sent. If the provider returns search items unexpectedly, they remain untrusted raw provider metadata and never become Tradstry evidence or citations.

## Failure and Fallback Policy

- `401` and `403`: authentication/configuration failure; never retry.
- `400` and `422`: invalid request or schema; never retry unchanged input.
- `429`: provider rate limit; preserve `Retry-After` for bounded backoff and then allow TinyAgents to try the configured role fallback.
- `408`, transport timeouts, and `5xx`: temporary provider failure eligible for the existing fallback policy.
- Malformed JSON, incomplete structured output, unknown tool-call IDs, and invalid function arguments: provider/model response failure; no side effects are committed.
- Unsupported video or provider-extension content: local validation failure before the network.

Perplexity's `models` fallback-chain request field is not used. Tradstry keeps fallback decisions in TinyAgents so attempts, usage, errors, and resolved models remain visible and consistent across both providers.

The Agent API can take longer on the first use of a new JSON schema. The adapter respects the caller's existing timeout rather than inventing an unbounded provider timeout. Deployment smoke tests warm and verify stable schemas without adding paid startup probes.

## Security and Accuracy

- API keys remain server-only and are never returned by GraphQL, logs, model errors, cache identities, or persisted raw payloads.
- Cache identities use the existing keyed digest approach and never contain the plain credential.
- Tradstry tools remain the only application tools. Perplexity receives no built-in search tool by default.
- Provider output stays untrusted until current schema, evidence, ownership, and action-approval checks pass.
- A catalogue listing never grants a model extra permissions or bypasses role-specific tool allowlists.

## Verification

### Configuration tests

- Reject missing or unknown `AGENT_MODEL_PROVIDER` when agents are enabled.
- Require only the selected provider's key.
- Preserve role and fallback validation for both providers.

### Fake HTTP adapter tests

- Catalogue success, missing model, authentication failure, timeout, and malformed payload.
- Unary text and usage parsing.
- JSON-schema request and structured response.
- Function declaration, function call, and function-result continuation.
- Image input and pre-network video rejection.
- SSE text, function arguments, usage, completion, malformed frames, and buffer limits.
- Error mapping for `400`, `401`, `403`, `408`, `422`, `429` with `Retry-After`, and `5xx`.

### Runtime regression tests

- Existing instant, fast, deep, specialist, verifier, memory, and assistance tests remain provider-agnostic through scripted models.
- Provider factory tests prove that one selected provider supplies all roles and fallbacks.
- No inactive-provider credential is read.

### Opt-in live smoke

An ignored or standalone command uses `PERPLEXITY_API_KEY` to validate configured deployment models against the live catalogue and exercises text, structured output, one harmless local function round trip, streaming, and image input. It performs no write action and is never part of normal CI.

## Acceptance Criteria

- Changing `AGENT_MODEL_PROVIDER`, its matching API key, and the three provider-specific model IDs switches the complete agent runtime.
- Gemini behavior and tests remain unchanged.
- Perplexity starts only with authenticated, registered model IDs.
- The same TinyAgents flows work for text, tools, JSON schemas, streaming, and supported images.
- Video produces a clear unsupported-provider response without calling Perplexity.
- Provider failures follow bounded, observable retry and fallback behavior.
- No Perplexity search result can bypass Tradstry's evidence system.

## Official References

- [Agent API quickstart](https://docs.perplexity.ai/docs/agent-api/quickstart)
- [Create Agent Response](https://docs.perplexity.ai/api-reference/agent-post)
- [OpenAI compatibility](https://docs.perplexity.ai/docs/agent-api/openai-compatibility)
- [List Models](https://docs.perplexity.ai/api-reference/models-get)
- [Agent API models](https://docs.perplexity.ai/docs/agent-api/models)
- [Tools and function calling](https://docs.perplexity.ai/docs/agent-api/tools/web-search)
- [Output control](https://docs.perplexity.ai/docs/agent-api/output-control)
- [Image attachments](https://docs.perplexity.ai/docs/agent-api/image-attachments)
- [Rate limits](https://docs.perplexity.ai/docs/admin/rate-limits-usage-tiers)
- [Feature roadmap](https://docs.perplexity.ai/docs/resources/feature-roadmap)
