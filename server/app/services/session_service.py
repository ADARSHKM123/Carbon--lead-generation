"""
Browser session management for Playwright-based platform scrapers.

Uses Playwright's SYNC API running in a background thread.
This avoids the Windows asyncio.create_subprocess_exec NotImplementedError
that occurs when using async_playwright with the default SelectorEventLoop.
"""

import asyncio
import queue
import threading
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

SESSIONS_DIR = Path(__file__).parent.parent.parent / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)


def session_path(platform: str) -> str:
    path = SESSIONS_DIR / platform
    path.mkdir(exist_ok=True)
    return str(path)


def session_exists(platform: str) -> bool:
    path = Path(session_path(platform)) / "Default"
    return path.exists()


# ── Sync Playwright session setup (runs in a thread) ───────────────────────

def _run_login_browser(platform: str, start_url: str, logged_in_selector: str, msg_q: queue.Queue):
    """
    Opens a real visible browser using Playwright's sync API.
    Runs in a background thread — puts progress messages into msg_q.
    msg_q items: ("session" | "done" | "error", value)
    """
    try:
        import sys, asyncio
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        print(f"[session] Starting Playwright for {platform}...", flush=True)
        with sync_playwright() as p:
            print(f"[session] Launching persistent browser context for {platform}...", flush=True)
            context = p.chromium.launch_persistent_context(
                user_data_dir=session_path(platform),
                headless=False,
                args=["--start-maximized"],
                no_viewport=True,
            )
            page = context.new_page()
            page.goto(start_url)
            msg = f"Browser opened. Please log in to {platform.capitalize()} in the window that just appeared."
            print(f"[session] {msg}", flush=True)
            msg_q.put(("session", msg))

            try:
                # Wait up to 3 minutes for the user to log in
                page.wait_for_selector(logged_in_selector, timeout=180_000)
                msg_q.put(("session", "Login detected! Saving session..."))
                time.sleep(2)  # Let cookies settle
                msg_q.put(("done", True))
            except Exception:
                msg_q.put(("session", "Login timeout (3 minutes exceeded). Please try again."))
                msg_q.put(("done", False))
            finally:
                context.close()

    except Exception as e:
        error_msg = str(e)
        print(f"[session] ERROR: {error_msg}", flush=True)
        msg_q.put(("error", error_msg))


async def setup_session(platform: str, start_url: str, logged_in_check_selector: str, websocket=None):
    """
    Starts the login browser in a background thread and streams
    progress messages to the WebSocket while waiting.
    """
    async def send(msg_type: str, value: str | bool):
        if not websocket:
            return
        try:
            if msg_type == "session":
                await websocket.send_json({"type": "session", "message": value})
            elif msg_type == "done":
                await websocket.send_json({"type": "done", "connected": value})
            elif msg_type == "error":
                await websocket.send_json({"type": "error", "message": value})
        except Exception:
            pass

    await send("session", f"Opening browser for {platform.capitalize()} login — please log in within 3 minutes...")

    msg_q: queue.Queue = queue.Queue()

    thread = threading.Thread(
        target=_run_login_browser,
        args=(platform, start_url, logged_in_check_selector, msg_q),
        daemon=True,
    )
    thread.start()

    # Drain the queue and forward messages to WebSocket
    result = False
    while True:
        try:
            msg_type, value = msg_q.get_nowait()
            await send(msg_type, value)
            if msg_type == "done":
                result = bool(value)
                break
            if msg_type == "error":
                result = False
                break
        except queue.Empty:
            if not thread.is_alive() and msg_q.empty():
                break
            await asyncio.sleep(0.5)

    thread.join(timeout=5)
    return result


PLATFORM_LOGIN_CONFIG = {
    "facebook": {
        "start_url": "https://www.facebook.com/login",
        "logged_in_check": '[aria-label="Facebook"][role="navigation"]',
    },
    "instagram": {
        "start_url": "https://www.instagram.com/accounts/login/",
        "logged_in_check": 'nav[role="navigation"]',
    },
    "linkedin": {
        "start_url": "https://www.linkedin.com/login",
        "logged_in_check": '[data-control-name="nav.homepage"]',
    },
}
