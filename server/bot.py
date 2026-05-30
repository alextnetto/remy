"""PRM Voice — main voice worker.

A pure voice transport (NVIDIA Parakeet STT → Gradium TTS over WebRTC + RTVI).
There is **no router LLM** in this pipeline: each finished user turn is
dispatched as a ``respond`` job to :class:`PRMActionWorker`, whose single
Nemotron LLM (tools registered directly, ``tool_choice`` NOT forced) picks one
PRM tool, drives the web app with a ``UICommand``, and speaks the reply.

Why no router: this mirrors the working ``yc-voice-agents-hackathon`` Nemotron
bot, where one LLM with concrete tools tool-calls reliably *unforced*. The
earlier two-LLM "router" design (copied from the OpenAI-based
``pipecat-music-player``) forced ``tool_choice`` to make Nemotron delegate to a
single ``handle_request`` tool — and on this vLLM endpoint forcing makes
Nemotron emit the tool-argument JSON as spoken text (you hear
``{"query": "..."}``). Removing the router fixes that and is simpler.

Architecture::

    main PipelineWorker (transport + RTVI, NO LLM):
      transport.in → STT → user_agg → TTS → transport.out → assistant_agg
        └── on_user_turn_stopped → worker.job("ui", "respond", {query})

    PRMActionWorker (UIWorker): the single LLM + PRM tools + @ui_event handlers.
      A @tool sends a UICommand (search / navigate / refresh / …) and calls
      respond_to_job(tts_speak=True); Pipecat routes that speech back to this
      worker's TTS.

Services (NVIDIA + Gradium): STT NVIDIA Parakeet (``NVIDIA_ASR_URL``); LLM
Nemotron via vLLM (see ``llm.py``, used by the action worker); TTS Gradium.

Run locally::  uv run bot.py
"""

import asyncio
import os

from dotenv import load_dotenv
from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import TTSSpeakFrame
from pipecat.pipeline.job_context import JobError
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
    UserTurnStrategies,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.gradium.tts import GradiumTTSService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.turns.user_turn_strategies import FilterIncompleteUserTurnStrategies

from action_worker import PRMActionWorker
from prm.services.nvidia_stt import NVidiaWebSocketSTTService

load_dotenv(override=True)

MAIN_NAME = "main"
UI_NAME = "ui"

# Keep references to in-flight dispatch tasks so they aren't garbage-collected
# mid-flight (asyncio only holds weak refs to tasks).
_dispatch_tasks: set[asyncio.Task] = set()


def _create_stt():
    """NVIDIA Parakeet streaming STT over WebSocket (16-bit PCM, 16 kHz, mono)."""
    return NVidiaWebSocketSTTService(
        url=os.getenv("NVIDIA_ASR_URL", "ws://localhost:8081"),
        strip_interim_prefix=True,
    )


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    logger.info("Starting PRM voice bot")

    runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)

    stt = _create_stt()
    tts = GradiumTTSService(
        api_key=os.environ["GRADIUM_API_KEY"],
        settings=GradiumTTSService.Settings(
            voice=os.getenv("GRADIUM_VOICE_ID", "Eu9iL_CYe8N-Gkx_"),
        ),
    )

    # No router LLM. The main pipeline only does speech I/O. The empty context +
    # aggregator pair gives us VAD-based turn detection (the
    # ``on_user_turn_stopped`` event below) and a place for the action worker's
    # spoken replies to append to (``BusTTSSpeakMessage(append_to_context=True)``).
    context = LLMContext()
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
            user_turn_strategies=FilterIncompleteUserTurnStrategies(),
        ),
    )
    user_agg = aggregators.user()

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_agg,
            tts,
            transport.output(),
            aggregators.assistant(),
        ]
    )

    worker = PipelineWorker(
        pipeline,
        name=MAIN_NAME,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
            # NVIDIA Parakeet needs 16 kHz input; Gradium TTS outputs 24 kHz
            # (matches the working hackathon bot-nemotron.py).
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        ),
        idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
    )

    action = PRMActionWorker()

    async def _respond(query: str) -> None:
        """Hand one finished user turn to the action worker and let it speak.

        The action worker's @tool sends its UICommand and calls
        ``respond_to_job(tts_speak=True)``; Pipecat routes that speech to this
        (the requesting) worker's TTS. We just await the job round-trip.
        """
        logger.info(f"respond({query!r})")
        try:
            async with worker.job(
                UI_NAME, name="respond", payload={"query": query}, timeout=30
            ):
                pass
        except JobError as e:
            logger.warning(f"ui job failed: {e}")
            await worker.queue_frame(TTSSpeakFrame("Something went wrong on my side."))

    @user_agg.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message):
        query = (getattr(message, "content", "") or "").strip()
        if not query:
            return
        # Fire-and-forget: the ``respond`` job is single-flight
        # (``@job(sequential=True)``), so overlapping turns queue on the worker
        # rather than racing.
        task = asyncio.create_task(_respond(query))
        _dispatch_tasks.add(task)
        task.add_done_callback(_dispatch_tasks.discard)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected")
        # Fixed greeting via TTS (there's no LLM to run).
        await worker.queue_frame(TTSSpeakFrame("Hey!"))

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        await runner.cancel()

    # Bring up the action worker alongside the main worker.
    await runner.add_workers(action, worker)

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
