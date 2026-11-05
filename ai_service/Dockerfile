FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AI_CONFIG_PATH=/app/config.yaml

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip3 install --upgrade pip && \
    pip3 install --index-url https://download.pytorch.org/whl/cu121 torch torchvision && \
    pip3 install -r /app/requirements.txt

COPY config.yaml /app/config.yaml
COPY download_weights.py /app/download_weights.py
COPY pipeline.py /app/pipeline.py
COPY app.py /app/app.py

# Pre-download core restoration & face weights at build time (or mount /app/weights volume)
RUN python3 /app/download_weights.py --weights-dir /app/weights

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
