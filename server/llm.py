"""LLM service factory for the PRM voice + action worker LLMs.

Selects a pipecat ``LLMService`` based on the ``LLM_PROVIDER`` env var so the
demo can be retargeted without touching worker code (spec §7 swap point).
Each branch reads its own env vars and lazily imports its SDK.

Providers:
- ``openai``  (default, dev fallback): OpenAI GPT-4.1 family via
  ``OPENAI_API_KEY`` / ``OPENAI_MODEL``.
- ``nvidia`` (NVIDIA showcase): Nemotron-3-Super served by vLLM over an
  OpenAI-compatible ``/v1`` endpoint. Uses ``VLLMOpenAILLMService`` (a thin
  OpenAILLMService subclass that times TTFB to the first non-thinking token).
  Thinking is OFF by default for voice latency; toggle with
  ``NEMOTRON_ENABLE_THINKING=true``.
"""

import os

from pipecat.services.llm_service import LLMService


def create_llm_service(*, system_prompt: str) -> LLMService:
    """Build the configured LLM service with the given system prompt.

    Reads ``LLM_PROVIDER`` (default ``"openai"``). Adding a provider is a
    new branch with the same shape: lazy-import the service + its settings,
    read its env vars, return the service.

    Args:
        system_prompt: The system instruction the worker's LLM should use.

    Returns:
        A pipecat ``LLMService`` ready to drop into a pipeline or a worker.

    Raises:
        KeyError: If a required API-key env var is missing.
        ValueError: If ``LLM_PROVIDER`` is not a known provider.
    """
    provider = (os.getenv("LLM_PROVIDER") or "openai").strip().lower()

    if provider == "openai":
        from pipecat.services.openai.base_llm import OpenAILLMSettings
        from pipecat.services.openai.llm import OpenAILLMService

        return OpenAILLMService(
            api_key=os.environ["OPENAI_API_KEY"],
            settings=OpenAILLMSettings(
                system_instruction=system_prompt,
                model=os.getenv("OPENAI_MODEL"),
            ),
        )

    if provider == "nvidia":
        # Nemotron-3-Super-120B served by vLLM (OpenAI-compatible chat
        # completions at /v1). Thinking OFF by default for low-latency voice.
        from prm.services.nemotron_llm import VLLMOpenAILLMService

        enable_thinking = (os.getenv("NEMOTRON_ENABLE_THINKING") or "false").strip().lower() == "true"
        return VLLMOpenAILLMService(
            api_key=os.getenv("NEMOTRON_LLM_API_KEY", "EMPTY"),  # vLLM ignores unless --api-key set
            base_url=os.getenv("NEMOTRON_LLM_URL", "http://localhost:8000/v1"),
            settings=VLLMOpenAILLMService.Settings(
                model=os.getenv("NEMOTRON_LLM_MODEL", "nvidia/nemotron-3-super"),
                system_instruction=system_prompt,
                extra={"extra_body": {"chat_template_kwargs": {"enable_thinking": enable_thinking}}},
            ),
        )

    raise ValueError(f"Unknown LLM_PROVIDER: {provider!r}. Expected one of: openai, nvidia.")
