"""Nemotron LLM service factory for the voice + action worker LLMs.

We run NVIDIA Nemotron-3-Super (served by vLLM, OpenAI-compatible chat
completions at ``/v1``) for both the voice router LLM and the action-worker
LLM — the same model + endpoint as the working hackathon bot. ``thinking`` is
OFF by default for voice latency; toggle with ``NEMOTRON_ENABLE_THINKING=true``.

Endpoint + model come from ``NEMOTRON_LLM_URL`` / ``NEMOTRON_LLM_MODEL`` (see
``.env.example``). ``VLLMOpenAILLMService`` is a thin ``OpenAILLMService``
subclass (vLLM speaks the OpenAI wire protocol) that reports TTFB to the first
non-thinking token.
"""

import os

from pipecat.services.llm_service import LLMService

from prm.services.nemotron_llm import VLLMOpenAILLMService


def create_llm_service(*, system_prompt: str) -> LLMService:
    """Build the Nemotron LLM service with the given system prompt.

    Args:
        system_prompt: The system instruction for this worker's LLM.

    Returns:
        A pipecat ``LLMService`` ready to drop into a pipeline or a worker.
    """
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
