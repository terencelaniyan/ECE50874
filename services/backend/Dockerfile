# Bowling Ball Backend – FastAPI
FROM python:3.12-slim

WORKDIR /app

# Install dependencies (no dev deps for smaller image)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY app/ ./app/

# Default: run uvicorn (override CMD for workers if needed)
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
