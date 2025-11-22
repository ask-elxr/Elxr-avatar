import os
import asyncio
from typing import Dict, Optional
from datetime import datetime, timedelta

import aiohttp
from loguru import logger
from dotenv import load_dotenv

from pipecat.audio.turn.smart_turn.base_smart_turn import SmartTurnParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import LLMRunFrame, EndFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.services.heygen.api import AvatarQuality, NewSessionRequest
from pipecat.services.heygen.video import HeyGenVideoService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams, DailyTransport

load_dotenv(override=True)

# Avatar configurations with database namespaces and voice settings
AVATAR_CONFIGS = {
    "mark-kohl": {
        "heygen_avatar_id": "Shawn_Therapist_public",
        "voice_id": "00967b2f-88a6-4a31-8153-110a92134b9f",  # Cartesia voice
        "pinecone_namespaces": ["mark-kohl", "general-knowledge"],
        "personality": "You are Mark Kohl, a mycologist, filmmaker, and kundalini instructor. You're deeply knowledgeable about fungal networks, consciousness, and breath practices. Be conversational, insightful, and grounded.",
        "max_video_duration_minutes": 5,
    },
    "willie-gault": {
        "heygen_avatar_id": "Shawn_Therapist_public",  # Replace with Willie's avatar
        "voice_id": "a0e99841-438c-4a64-b679-ae501e7d6091",  # Different Cartesia voice
        "pinecone_namespaces": ["willie-gault", "sports-knowledge"],
        "personality": "You are Willie Gault, Olympic track athlete and NFL wide receiver. You combine athletic excellence with business wisdom. Be motivational, direct, and authentic.",
        "max_video_duration_minutes": 5,
    },
    "fitness-coach": {
        "heygen_avatar_id": "Shawn_Therapist_public",
        "voice_id": "b7d50908-b17c-442d-ad8d-810c63997ed9",
        "pinecone_namespaces": ["fitness-knowledge", "health-tips"],
        "personality": "You are an energetic fitness coach. Provide actionable health and fitness advice. Be encouraging, enthusiastic, and science-based.",
        "max_video_duration_minutes": 3,
    },
}

transport_params = {
    "daily": lambda: DailyParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
        video_out_enabled=True,
        video_out_is_live=True,
        video_out_width=1280,
        video_out_height=720,
        video_out_bitrate=2_000_000,
        vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.2)),
        turn_analyzer=LocalSmartTurnAnalyzerV3(params=SmartTurnParams()),
    ),
    "webrtc": lambda: TransportParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
        video_out_enabled=True,
        video_out_is_live=True,
        video_out_width=1280,
        video_out_height=720,
        vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.2)),
        turn_analyzer=LocalSmartTurnAnalyzerV3(params=SmartTurnParams()),
    ),
}


class VideoToAudioSwitcher:
    """Handles automatic switching from video to audio-only after time limit."""
    
    def __init__(self, max_duration_minutes: int):
        self.max_duration = timedelta(minutes=max_duration_minutes)
        self.start_time = datetime.now()
        self.video_enabled = True
        
    def should_switch_to_audio(self) -> bool:
        """Check if we should switch to audio-only mode."""
        if not self.video_enabled:
            return False
        
        elapsed = datetime.now() - self.start_time
        if elapsed >= self.max_duration:
            logger.info(f"Video duration limit reached ({self.max_duration}), switching to audio-only")
            return True
        return False
    
    def switch_to_audio_only(self, pipeline: Pipeline, heygen_service: HeyGenVideoService):
        """Switch pipeline to audio-only mode."""
        self.video_enabled = False
        # Remove HeyGen from pipeline (keeps voice via TTS)
        logger.info("Switched to audio-only mode - video disabled, voice preserved")


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments, avatar_id: str = "mark-kohl"):
    """
    Run bot with specified avatar configuration.
    
    Args:
        transport: WebRTC/Daily transport
        runner_args: Runner configuration
        avatar_id: ID of avatar to use (from AVATAR_CONFIGS)
    """
    
    if avatar_id not in AVATAR_CONFIGS:
        logger.error(f"Avatar ID '{avatar_id}' not found in configuration")
        avatar_id = "mark-kohl"  # Fallback to default
    
    config = AVATAR_CONFIGS[avatar_id]
    logger.info(f"Starting bot with avatar: {avatar_id}")
    logger.info(f"Pinecone namespaces: {config['pinecone_namespaces']}")
    logger.info(f"Max video duration: {config['max_video_duration_minutes']} minutes")
    
    async with aiohttp.ClientSession() as session:
        # Initialize services with required API keys
        deepgram_key = os.getenv("DEEPGRAM_API_KEY", "")
        cartesia_key = os.getenv("CARTESIA_API_KEY", "")
        google_key = os.getenv("GOOGLE_API_KEY", "")
        heygen_key = os.getenv("HEYGEN_API_KEY", "")
        
        if not all([deepgram_key, cartesia_key, google_key, heygen_key]):
            logger.error("Missing required API keys")
            raise ValueError("Required API keys not set")
        
        stt = DeepgramSTTService(api_key=deepgram_key)
        
        tts = CartesiaTTSService(
            api_key=cartesia_key,
            voice_id=config["voice_id"],  # Avatar-specific voice
        )
        
        llm = GoogleLLMService(api_key=google_key)
        
        heyGen = HeyGenVideoService(
            api_key=heygen_key,
            session=session,
            session_request=NewSessionRequest(
                avatar_id=config["heygen_avatar_id"],
                version="v2",
                quality=AvatarQuality.high
            ),
        )
        
        # Initialize video-to-audio switcher
        switcher = VideoToAudioSwitcher(max_duration_minutes=config["max_video_duration_minutes"])
        
        # System message with personality and database context
        system_message = f"""{config['personality']}

Your knowledge base includes: {', '.join(config['pinecone_namespaces'])}

Important:
- Your output will be spoken aloud, so avoid special characters, emojis, or bullet points
- Be succinct and conversational
- Respond naturally based on your personality
- After {config['max_video_duration_minutes']} minutes, the video will switch to audio-only to save resources
"""
        
        # Initialize context with properly typed messages
        context = LLMContext()
        context.add_system_message(system_message)
        context_aggregator = LLMContextAggregatorPair(context)
        
        # Build pipeline
        pipeline_processors = [
            transport.input(),  # User input
            stt,  # Speech-to-text
            context_aggregator.user(),  # User context
            llm,  # LLM (Google Gemini)
            tts,  # Text-to-speech (Cartesia)
        ]
        
        # Add HeyGen video initially
        if switcher.video_enabled:
            pipeline_processors.append(heyGen)
        
        pipeline_processors.extend([
            transport.output(),  # Output to user
            context_aggregator.assistant(),  # Assistant context
        ])
        
        pipeline = Pipeline(pipeline_processors)
        
        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                enable_metrics=True,
                enable_usage_metrics=True,
            ),
            idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
        )
        
        @transport.event_handler("on_client_connected")
        async def on_client_connected(transport, client):
            logger.info(f"Client connected to {avatar_id} avatar")
            
            if isinstance(transport, DailyTransport):
                await transport.update_publishing(
                    publishing_settings={
                        "camera": {
                            "sendSettings": {
                                "allowAdaptiveLayers": True,
                            }
                        }
                    }
                )
            
            # Greeting message
            context.add_system_message("Start by saying 'Hello' and introduce yourself briefly.")
            await task.queue_frames([LLMRunFrame()])
        
        @transport.event_handler("on_client_disconnected")
        async def on_client_disconnected(transport, client):
            logger.info(f"Client disconnected from {avatar_id} avatar")
            await task.cancel()
        
        # Periodic check for video-to-audio switch
        async def monitor_video_duration():
            while True:
                await asyncio.sleep(30)  # Check every 30 seconds
                
                if switcher.should_switch_to_audio():
                    switcher.switch_to_audio_only(pipeline, heyGen)
                    # Rebuild pipeline without video
                    logger.info("Rebuilding pipeline for audio-only mode")
                    break
        
        # Start monitoring task
        monitor_task = asyncio.create_task(monitor_video_duration())
        
        runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)
        
        try:
            await runner.run(task)
        finally:
            monitor_task.cancel()


async def bot(runner_args: RunnerArguments, avatar_id: str = "mark-kohl"):
    """
    Main bot entry point compatible with Pipecat Cloud.
    
    Args:
        runner_args: Runner configuration
        avatar_id: Avatar to use (default: mark-kohl)
    """
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args, avatar_id)


def get_avatar_list() -> Dict:
    """Return list of available avatars with their configurations."""
    return {
        avatar_id: {
            "id": avatar_id,
            "name": avatar_id.replace("-", " ").title(),
            "voice_id": config["voice_id"],
            "max_video_duration_minutes": config["max_video_duration_minutes"],
            "knowledge_bases": config["pinecone_namespaces"],
        }
        for avatar_id, config in AVATAR_CONFIGS.items()
    }


if __name__ == "__main__":
    from pipecat.runner.run import main
    
    # Get avatar ID from environment or use default
    avatar_id = os.getenv("AVATAR_ID", "mark-kohl")
    
    main()
