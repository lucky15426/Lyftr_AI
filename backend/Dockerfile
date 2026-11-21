# ---- build stage: resolve and install dependencies into an isolated venv ----
FROM python:3.11-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---- runtime stage: venv + app code only, non-root ----
FROM python:3.11-slim AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    DATABASE_URL=sqlite:////data/app.db
RUN useradd --create-home --uid 1000 app \
    && mkdir -p /data && chown app:app /data
COPY --from=builder /opt/venv /opt/venv
WORKDIR /srv
COPY app ./app
USER app
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"
# $PORT is injected by Render; defaults to 8000 locally
CMD ["sh", "-c", "uvicorn app.asgi:app --host 0.0.0.0 --port ${PORT:-8000}"]
