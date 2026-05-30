"""PRM Voice — main voice worker (skeleton).

Adapted from ``pipecat-music-player/server/bot.py``. The main
``PipelineWorker`` runs the conversation (STT -> LLM -> TTS) and owns the
transport + RTVI bridge to the client. Its single tool, ``handle_request``,
forwards each spoken request to the ``PRMActionWorker`` (see
``action_worker.py``), which owns the PRM tools, drives the web app with UI
commands, and speaks the reply back verbatim.

Architecture (spec §6, two inferences per turn: route -> act)::

    main PipelineWorker (transport + RTVI):
      transport.in -> STT -> user_agg -> LLM(router) -> TTS -> transport.out -> assistant_agg
        └── handle_request(query) tool
              └── worker.job("ui", name="respond", payload={query})

    PRMActionWorker (UIWorker): PRM tools + @ui_event screen handlers

Swap points (spec §7):
- STT: ``STT_PROVIDER`` -> Gradium (dev/fallback) | NVIDIA Parakeet.
- TTS: Gradium (primary).
- LLM provider branch lives in ``llm.py`` (``LLM_PROVIDER``).

Run locally::

    uv run bot.py

Requires (see .env.example): GRADIUM_API_KEY (+ GRADIUM_VOICE_ID), an LLM
provider key (OPENAI_API_KEY by default), and PRM_API_BASE_URL pointing at
the Next.js app.
"""

import os

from dotenv import load_dotenv
from loguru import logger
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.job_context import JobError
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.gradium.tts import GradiumTTSService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams

from action_worker import PRMActionWorker
from llm import create_llm_service

load_dotenv(override=True)

MAIN_NAME = "main"
UI_NAME = "ui"


# The router prompt: never answer directly, never rephrase deictic words —
# the action worker resolves them against the live screen and speaks the
# reply (spec §6). Mirrors the music-player VOICE_PROMPT, retargeted to PRM.
VOICE_PROMPT = """\
You are the voice layer for a personal relationship manager (PRM). A separate \
action layer owns all data and screen state and speaks every substantive \
reply. You do not know what is on screen. You do not navigate, read, or \
change data on your own.

## Absolute routing rule
Call ``handle_request`` for every user utterance that involves the PRM — \
adding or updating people, notes, dates, organizations, moments, or \
reminders; navigating; or any question about a person or about what's on \
screen. The action layer delivers the spoken reply itself, so after calling \
the tool you stay silent — do not confirm, summarize, or rephrase.

Call the tool every time, even on repeats. Do not predict the result and \
skip the tool. Do not reuse a previous result for a new turn.

## When not to call the tool
Only respond directly for small talk that doesn't touch the PRM ("hello", \
"thanks") or a single short clarifying question when the request is genuinely \
ambiguous.

## Voice rules
- Plain spoken language only. No markdown, lists, or symbols. Very short.
- After ``handle_request``, stay silent and let the action layer speak.

## handle_request arguments
Pass the user's request as a self-contained query. Leave anything that could \
refer to what's on screen verbatim — "this", "that", "the first one", and \
pronouns like "her", "him", "their". The user is pointing at what they're \
looking at; the action layer sees the screen and resolves these. Only rewrite \
genuine cross-turn references that name a different entity."""


async def handle_request(params: FunctionCallParams, query: str):
    """Delegate the user's request to the PRM action layer.

    Args:
        query: The user's request, passed verbatim. Resolve cross-turn \
            references but leave on-screen deixis ("this", "the first one", \
            "her") untouched for the action layer to resolve.
    """
    logger.info(f"handle_request('{query}')")
    try:
        async with params.pipeline_worker.job(
            UI_NAME, name="respond", payload={"query": query}, timeout=30
        ) as t:
            pass
    except JobError as e:
        logger.warning(f"ui job failed: {e}")
        await params.result_callback("Something went wrong on my side.")
        return

    # The action worker either spoke verbatim (tts_speak -> t.response is None)
    # or returned text for the voice LLM to phrase. Hand it straight back.
    await params.result_callback(t.response)


def _create_stt():
    """Build the STT service per ``STT_PROVIDER`` (spec §7 swap point).

    - ``gradium`` (default / fallback): GradiumSTTService.
    - ``nvidia``: NVIDIA Parakeet over WebSocket (NVidiaWebSocketSTTService).
    """
    provider = (os.getenv("STT_PROVIDER") or "gradium").strip().lower()
    if provider == "nvidia":
        from prm.services.nvidia_stt import NVidiaWebSocketSTTService

        return NVidiaWebSocketSTTService(
            url=os.getenv("NVIDIA_ASR_URL", "ws://localhost:8081"),
            strip_interim_prefix=True,
        )

    from pipecat.services.gradium.stt import GradiumSTTService

    return GradiumSTTService(api_key=os.environ["GRADIUM_API_KEY"])


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    logger.info("Starting PRM voice bot")

    runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)

    stt = _create_stt()
    # Only override the voice when GRADIUM_VOICE_ID is set: passing voice=None
    # would clobber GradiumTTSService's built-in default voice (its Settings
    # treat None as a given value), so leave it unset to fall back to default.
    voice_id = os.getenv("GRADIUM_VOICE_ID")
    tts_settings = (
        GradiumTTSService.Settings(voice=voice_id) if voice_id else GradiumTTSService.Settings()
    )
    tts = GradiumTTSService(
        api_key=os.environ["GRADIUM_API_KEY"],
        settings=tts_settings,
    )
    llm = create_llm_service(system_prompt=VOICE_PROMPT)
    llm.register_direct_function(handle_request, cancel_on_interruption=False, timeout_secs=30)

    context = LLMContext(tools=ToolsSchema(standard_tools=[handle_request]))
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            aggregators.user(),
            llm,
            tts,
            transport.output(),
            aggregators.assistant(),
        ]
    )

    worker = PipelineWorker(
        pipeline,
        name=MAIN_NAME,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected")
        context.add_message(
            {
                "role": "developer",
                "content": (
                    "Greet the user. Welcome them to their personal "
                    "relationship manager and mention they can add people, "
                    "notes, dates, and reminders, or ask what they know about "
                    "someone. One short sentence."
                ),
            }
        )
        await worker.queue_frame(LLMRunFrame())

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        await runner.cancel()

    # Bring up the action worker alongside the main worker.
    await runner.add_workers(
        PRMActionWorker(),
        worker,
    )

    await runner.run()


async def bot(runner_args: RunnerArguments):
    """Pipecat Cloud / runner entry point."""

    if os.environ.get("ENV") != "local":
        from pipecat.audio.filters.krisp_viva_filter import KrispVivaFilter

        krisp_filter = KrispVivaFilter()
    else:
        krisp_filter = None

    transport_params = {
        "daily": lambda: DailyParams(
            audio_in_enabled=True,
            audio_in_filter=krisp_filter,
            audio_out_enabled=True,
        ),
        "webrtc": lambda: TransportParams(
            audio_in_enabled=True,
            audio_in_filter=krisp_filter,
            audio_out_enabled=True,
        ),
    }

    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
