from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.api.routes import personalize, send, hiker

try:
    from app.api.routes import discover
    _discover_available = True
except Exception:
    _discover_available = False

app = FastAPI(title="Carbon Outreach API", version="1.0.0")

# Standard CORS for HTTP routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(personalize.router, prefix="/api")
app.include_router(send.router, prefix="/api")
app.include_router(hiker.router, prefix="/api")

# Playwright-based discovery routes only load when playwright is installed
# (local dev). On the cloud server they are silently skipped.
if _discover_available:
    app.include_router(discover.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok", "service": "carbon-outreach-api"}
