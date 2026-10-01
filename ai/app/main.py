import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import settings
from app.routers import ai
from app.services.risk_service import risk_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("digicampus.ai")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.artifacts_dir.mkdir(parents=True, exist_ok=True)
    risk_service.load()  # warm the model; RAG index builds lazily on first /ai/chat call
    yield


app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
app.include_router(ai.router)


@app.get("/chat-ui", include_in_schema=False)
def chat_ui():
    return FileResponse(Path(__file__).parent / "static" / "chat.html")


@app.get("/health", tags=["Ops"])
def health():
    return {"status": "ok", "version": settings.version, "llm_enabled": bool(settings.openai_api_key)}


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    logger.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"detail": "Internal AI engine error"})
