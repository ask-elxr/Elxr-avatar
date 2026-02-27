#!/usr/bin/env python3
"""
LiveKit Agent with LiveAvatar for real-time avatar streaming.
This runs server-side and handles avatar sessions, bypassing mobile browser throttling.

Usage:
    python scripts/avatar_agent.py dev     # Development mode
    python scripts/avatar_agent.py start   # Production mode
"""

import os
from dotenv import load_dotenv
from loguru import logger

from livekit import agents
from livekit.agents import AgentServer, AgentSession, Agent, cli
from livekit.plugins import liveavatar, openai, deepgram, elevenlabs

load_dotenv(".env.local")
load_dotenv()

LIVEAVATAR_API_KEY = os.getenv("LIVEAVATAR_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("AI_INTEGRATIONS_OPENAI_API_KEY") or ""
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")


class AvatarAssistant(Agent):
    """Voice AI assistant with avatar capabilities."""
    
    def __init__(self, avatar_id: str = "") -> None:
        super().__init__(
            instructions="""You are a helpful AI assistant with a visual avatar presence.
            You are knowledgeable, friendly, and engage in natural conversation.
            Keep your responses concise and conversational.
            Do not use complex formatting, emojis, or special characters.""",
        )
        self.avatar_id = avatar_id


server = AgentServer()


@server.rtc_session()
async def avatar_session(ctx: agents.JobContext):
    """
    Handle an avatar session for a user.
    This is triggered when a client joins a LiveKit room.
    """
    logger.info(f"New avatar session started for room: {ctx.room.name}")
    
    room_name = ctx.room.name
    avatar_id = None
    
    if room_name.startswith("liveavatar-"):
        parts = room_name.split("-")
        if len(parts) >= 4:
            avatar_id = "-".join(parts[1:-2])
    
    if not avatar_id:
        avatar_id = os.getenv("LIVEAVATAR_AVATAR_ID", "josh_lite3_20230714")
    
    logger.info(f"Parsed avatar_id from room '{room_name}': {avatar_id}")
    
    logger.info(f"Using avatar ID: {avatar_id}")
    
    stt = deepgram.STT(
        api_key=DEEPGRAM_API_KEY,
        model="nova-2",
        language="en-US",
    )
    
    llm = openai.LLM(
        api_key=OPENAI_API_KEY,
        model="gpt-4o-mini",
    )
    
    tts = elevenlabs.TTS(
        api_key=ELEVENLABS_API_KEY,
        voice_id="pNInz6obpgDQGcFmaJgB",
    )
    
    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
    )
    
    avatar = liveavatar.AvatarSession(
        avatar_id=avatar_id,
        api_key=LIVEAVATAR_API_KEY,
    )
    
    await avatar.start(session, room=ctx.room)
    logger.info(f"Avatar {avatar_id} started and joined room")
    
    await session.start(
        room=ctx.room,
        agent=AvatarAssistant(avatar_id=avatar_id),
    )
    
    await session.generate_reply(
        instructions="Greet the user warmly and introduce yourself."
    )
    
    logger.info("Agent session started, waiting for user interaction...")


if __name__ == "__main__":
    cli.run_app(server)
