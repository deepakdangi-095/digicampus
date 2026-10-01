from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Digi Campus AI Engine"
    version: str = "1.0.0"
    service_api_key: str | None = None
    cors_origins: list[str] = ["*"]

    # LLM / embeddings (all optional; graceful fallbacks exist)
    openai_api_key: str | None = None
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"
    hf_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Paths
    data_dir: Path = BASE_DIR / "data"
    artifacts_dir: Path = BASE_DIR / "artifacts"

    # RAG
    rag_top_k: int = 4
    rag_min_score: float = 0.25  # dense cosine below this => "out of scope"
    tfidf_min_score: float = 0.08  # offline TF-IDF cosine threshold

    # Support message shown when a student expresses thoughts of self-harm (edit for your country/campus)
    crisis_support_text: str = (
        "I'm really glad you told me, and I'm taking it seriously. You matter, and you don't have to handle this alone. "
        "Please reach out right now to someone you trust: a friend, a family member, your warden, your Faculty Advisor "
        "or the campus counselling cell. In India you can also call Tele-MANAS on 14416 (free, 24x7). If you feel you "
        "might act on these thoughts or are in immediate danger, call your local emergency number (112 in India) or go "
        "to the nearest hospital. I'm here to keep talking with you as well."
    )

    # Chat / self-argument
    self_check_rounds: int = 1  # LLM critic rounds (0 disables; deterministic verification always runs)
    session_ttl_seconds: int = 7200
    max_history_turns: int = 20

    @property
    def risk_model_path(self) -> Path:
        return self.artifacts_dir / "risk_model.joblib"

    @property
    def faiss_dir(self) -> Path:
        return self.artifacts_dir / "faiss_index"

    @property
    def knowledge_dir(self) -> Path:
        return self.data_dir / "knowledge"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
