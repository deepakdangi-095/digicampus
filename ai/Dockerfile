FROM python:3.11-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
COPY requirements.txt requirements-dense.txt ./
RUN pip install -r requirements.txt
# Build with --build-arg DENSE=1 to add FAISS/embeddings/OpenAI (large image, downloads a model on first use)
ARG DENSE=0
RUN if [ "$DENSE" = "1" ]; then pip install -r requirements-dense.txt; fi
COPY . .
RUN python scripts/train_risk_model.py
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
