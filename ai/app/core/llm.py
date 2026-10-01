"""LLM / embedding factories. Both degrade gracefully when no API key is configured."""
from functools import lru_cache

from app.core.config import settings


@lru_cache
def get_llm():
    """Return a LangChain chat model, or None if no provider is configured."""
    if settings.openai_api_key:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=settings.llm_model, temperature=0.1, api_key=settings.openai_api_key, timeout=30)
    return None


@lru_cache
def get_embeddings():
    """OpenAI embeddings if a key exists, else local sentence-transformers (normalised)."""
    if settings.openai_api_key:
        from langchain_openai import OpenAIEmbeddings

        return OpenAIEmbeddings(model=settings.embedding_model, api_key=settings.openai_api_key)
    from langchain_huggingface import HuggingFaceEmbeddings

    return HuggingFaceEmbeddings(
        model_name=settings.hf_embedding_model,
        encode_kwargs={"normalize_embeddings": True},
    )
