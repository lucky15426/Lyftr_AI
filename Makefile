.PHONY: up down logs test build clean

# Start the whole stack: backend on :8000, frontend on :3000
up:
	@test -f .env || (cp .env.example .env && echo ">> Created .env from .env.example - add your real LLM_API_KEYS to it.")
	docker compose up --build -d
	@echo ""
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:8000/health"

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

# Run backend tests locally (needs: pip install -r backend/requirements-dev.txt)
test:
	cd backend && python -m pytest -q

# Stop the stack AND delete the SQLite volume
clean:
	docker compose down -v
