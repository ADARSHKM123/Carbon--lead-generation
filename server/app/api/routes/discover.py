import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.models.schemas import DiscoverRequest
from app.services.scraper_service import discover_facebook_leads, discover_instagram_leads
from app.services.session_service import (
    setup_session, session_exists, PLATFORM_LOGIN_CONFIG
)

router = APIRouter()


@router.get("/session/status/{platform}")
async def session_status(platform: str):
    """Check whether a saved login session exists for a platform."""
    exists = session_exists(platform)
    return {"platform": platform, "connected": exists}


@router.websocket("/ws/session/{platform}")
async def session_login_ws(websocket: WebSocket, platform: str):
    """
    WebSocket endpoint to trigger the one-time manual login flow.
    Opens a real browser window; streams status messages back to the client.
    """
    await websocket.accept()
    config = PLATFORM_LOGIN_CONFIG.get(platform)
    if not config:
        await websocket.send_json({"type": "error", "message": f"Unknown platform: {platform}"})
        await websocket.close()
        return

    try:
        # setup_session streams all messages (session/done/error) directly to the websocket
        await setup_session(
            platform=platform,
            start_url=config["start_url"],
            logged_in_check_selector=config["logged_in_check"],
            websocket=websocket,
        )
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@router.websocket("/ws/discover")
async def discover_ws(websocket: WebSocket):
    """
    WebSocket endpoint that runs the Facebook scraper and streams
    real-time progress + discovered leads back to the client.

    Client sends:
    {
      "search_terms": ["ethnic wear india", "#indianfashion"],
      "filters": { "min_followers": 1000, "must_have_website": false },
      "max_per_term": 15
    }

    Server streams:
    { "type": "progress", "message": "...", "found": 5, "total": 20 }
    { "type": "lead",     "lead": { ...lead object... } }
    { "type": "complete", "total": 23 }
    { "type": "error",    "message": "..." }
    """
    await websocket.accept()

    try:
        params = await websocket.receive_json()
        search_terms = params.get("search_terms", [])
        filters = params.get("filters", {})
        # Accept both old (max_per_term) and new (max_results) for compat
        max_results = params.get("max_results") or params.get("max_per_term") or 15
        platforms = params.get("platforms") or ["facebook"]

        if not search_terms:
            await websocket.send_json({"type": "error", "message": "No search terms provided."})
            return

        # Split total cap across platforms × terms so the final result count
        # matches the user-set max_results value
        num_buckets = max(1, len(platforms) * len(search_terms))
        per_term = max(1, max_results // num_buckets + 1)

        leads_remaining = [max_results]  # mutable counter shared with callbacks

        async def on_progress(data: dict):
            try:
                await websocket.send_json({"type": "progress", **data})
            except Exception:
                pass

        async def on_lead_found(lead: dict):
            if leads_remaining[0] <= 0:
                return
            leads_remaining[0] -= 1
            try:
                await websocket.send_json({"type": "lead", "lead": lead})
            except Exception:
                pass

        leads = []
        for platform in platforms:
            if leads_remaining[0] <= 0:
                break

            if platform == "facebook":
                platform_leads = await discover_facebook_leads(
                    search_terms=search_terms,
                    filters=filters,
                    on_progress=on_progress,
                    on_lead_found=on_lead_found,
                    max_per_term=per_term,
                )
            elif platform == "instagram":
                platform_leads = await discover_instagram_leads(
                    search_terms=search_terms,
                    filters=filters,
                    on_progress=on_progress,
                    on_lead_found=on_lead_found,
                    max_per_term=per_term,
                )
            else:
                await on_progress({
                    "message": f"{platform.capitalize()} discovery is not implemented yet.",
                    "found": len(leads),
                    "total": len(leads),
                })
                platform_leads = []

            # Only count leads we actually forwarded (callback gated by cap)
            leads.extend(platform_leads[: max(0, max_results - len(leads))])

        await websocket.send_json({"type": "complete", "total": len(leads)})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
