FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install poetry
RUN pip install poetry

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Install dependencies
RUN poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi

# Copy app
COPY . .

# Create data directory
RUN mkdir -p /data

EXPOSE 8000

CMD ["fastapi", "run", "app/main.py", "--port", "8000", "--host", "0.0.0.0"]
