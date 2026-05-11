"""
Playwright-based Facebook page scraper with human-behavior mimicry.

Discovery strategy:
  1. Search DuckDuckGo (HTML) for Facebook page URLs — no FB login needed,
     no bot wall, returns real results.
  2. Visit each Facebook page using the saved session to extract profile data.

Human-mimicry applied:
  - Real Chrome user-agent string
  - navigator.webdriver removed via JS injection
  - navigator.plugins / languages spoofed
  - Gradual scrolling with random pauses
  - Random mouse movements between actions
  - Variable delays (never uniform)
"""

import asyncio
import datetime
import queue
import random
import re
import threading
from urllib.parse import quote_plus, unquote, urlparse, parse_qs
from playwright.sync_api import sync_playwright
from app.services.session_service import session_path, session_exists


# Real Chrome 131 on Windows 10 UA — matches Playwright's bundled Chromium version
CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# JS injected into every page to hide automation signals
STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', {
    get: () => { const p = []; p.length = 5; return p; }
});
Object.defineProperty(navigator, 'languages', {
    get: () => ['en-IN', 'en-GB', 'en', 'hi']
});
Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
"""


# ── Helpers ────────────────────────────────────────────────────────────────

def normalize_term(term: str) -> str:
    return term.lstrip("#").replace("_", " ").strip()


def parse_follower_count(text: str) -> int:
    if not text:
        return 0
    text = text.lower().replace(",", "")
    match = re.search(r"([\d.]+)\s*([km]?)", text)
    if not match:
        return 0
    num = float(match.group(1))
    suffix = match.group(2)
    if suffix == "k":
        return int(num * 1_000)
    if suffix == "m":
        return int(num * 1_000_000)
    return int(num)


def human_pause(min_s=0.8, max_s=2.5):
    """Random pause mimicking human reaction time."""
    import time
    time.sleep(random.uniform(min_s, max_s))


def human_scroll(page, total_px=1200):
    """Scroll gradually in small steps like a human reading."""
    steps = random.randint(4, 8)
    per_step = total_px // steps
    for _ in range(steps):
        jitter = random.randint(-30, 30)
        page.evaluate(f"window.scrollBy(0, {per_step + jitter})")
        human_pause(0.15, 0.45)


def human_mouse_wander(page):
    """Move mouse to a random position to simulate natural presence."""
    try:
        x = random.randint(200, 1100)
        y = random.randint(150, 650)
        page.mouse.move(x, y, steps=random.randint(5, 15))
    except Exception:
        pass


def make_context(playwright, user_data_dir=None):
    """
    Launch a Chromium context with human-like fingerprint.
    Uses a persistent context (with saved session) when user_data_dir is given.
    """
    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--disable-notifications",
        "--disable-popup-blocking",
        "--start-maximized",
        f"--user-agent={CHROME_UA}",
    ]

    if user_data_dir:
        ctx = playwright.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
            args=launch_args,
            user_agent=CHROME_UA,
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            no_viewport=True,
        )
    else:
        browser = playwright.chromium.launch(headless=False, args=launch_args)
        ctx = browser.new_context(
            user_agent=CHROME_UA,
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            viewport={"width": 1366, "height": 768},
        )

    # Inject stealth scripts on every new page
    ctx.add_init_script(STEALTH_JS)

    ctx.set_extra_http_headers({
        "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8,hi;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
    })

    return ctx


# ── DuckDuckGo search → Facebook page URLs ─────────────────────────────────

SKIP_FB_PATHS = {
    "/login", "/l/", "/sharer", "/dialog", "/groups", "/events",
    "/marketplace", "/watch", "/gaming", "/help", "/privacy",
    "/settings", "/ads", "/policies", "/pages/create", "/hashtag",
    "/reels", "/reel", "/stories", "/notifications", "/friends",
}


def is_valid_fb_page_url(url: str) -> bool:
    url = url.split("?")[0].rstrip("/")
    path = (
        url.replace("https://www.facebook.com", "")
           .replace("https://m.facebook.com", "")
           .replace("https://facebook.com", "")
    )
    if not path or path == "/":
        return False
    if any(path.startswith(s) for s in SKIP_FB_PATHS):
        return False
    parts = [p for p in path.split("/") if p]
    if not parts:
        return False
    return True


def search_facebook_pages_via_duckduckgo(page, search_term: str, max_results: int, msg_q: queue.Queue) -> list:
    """
    Searches DuckDuckGo HTML for Facebook page URLs.
    DuckDuckGo HTML endpoint returns static markup — no JS, no bot wall.
    """
    import time
    keyword = normalize_term(search_term)

    # Narrow to Facebook page results for Indian fashion brands
    query = f'site:facebook.com "{keyword}" india fashion'
    search_url = f"https://duckduckgo.com/html/?q={quote_plus(query)}&kl=in-en"

    msg_q.put(("progress", {"message": f'Discovering pages for "{keyword}"...', "found": 0, "total": 0}))
    print(f"[scraper] DDG search: {search_url}", flush=True)

    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
        human_pause(2, 4)
        human_mouse_wander(page)
    except Exception as e:
        print(f"[scraper] DDG nav error: {e}", flush=True)
        return []

    title = page.title()
    print(f"[scraper] DDG page title: '{title}'", flush=True)

    fb_urls = set()

    # Extract from result links
    for sel in ["a.result__a", "a.result__url", 'a[href*="facebook.com"]']:
        try:
            for link in page.query_selector_all(sel):
                raw = (link.get_attribute("href") or "").strip()
                # Unwrap DDG redirect: /l/?uddg=<encoded>
                if "duckduckgo.com/l/" in raw or raw.startswith("/l/"):
                    qs = parse_qs(urlparse(raw).query)
                    raw = unquote(qs.get("uddg", [""])[0])
                if "facebook.com" not in raw:
                    continue
                raw = raw.split("?")[0].rstrip("/")
                if is_valid_fb_page_url(raw):
                    fb_urls.add(raw)
        except Exception:
            continue

    # Regex fallback on raw HTML
    try:
        content = page.content()
        for slug in re.findall(r'facebook\.com/([A-Za-z0-9._\-]+(?:/[A-Za-z0-9._\-]+)*)', content):
            url = f"https://www.facebook.com/{slug.rstrip('/')}"
            if is_valid_fb_page_url(url):
                fb_urls.add(url)
    except Exception:
        pass

    # Scroll once to load more results and re-collect
    human_scroll(page, 800)
    human_pause(1.5, 3)
    try:
        for link in page.query_selector_all("a.result__a"):
            raw = (link.get_attribute("href") or "").strip()
            if "duckduckgo.com/l/" in raw:
                qs = parse_qs(urlparse(raw).query)
                raw = unquote(qs.get("uddg", [""])[0])
            if "facebook.com" in raw:
                raw = raw.split("?")[0].rstrip("/")
                if is_valid_fb_page_url(raw):
                    fb_urls.add(raw)
    except Exception:
        pass

    results = list(fb_urls)[:max_results]
    print(f"[scraper] '{keyword}' → {len(results)} Facebook URLs via DDG", flush=True)
    if results:
        print(f"[scraper] Sample: {results[:3]}", flush=True)
    return results


# ── Facebook page profile extractor ────────────────────────────────────────

def extract_facebook_page_details_sync(page, page_url: str) -> dict:
    """Visits a public Facebook page and extracts profile data."""
    import time
    try:
        print(f"[scraper] Visiting: {page_url}", flush=True)
        page.goto(page_url, wait_until="domcontentloaded", timeout=25_000)
        current = page.url
        title = page.title()
        print(f"[scraper] Landed: {current} | Title: '{title}'", flush=True)
        human_pause(2, 4)
        human_mouse_wander(page)

        # Dismiss cookie/login popups
        for selector in [
            '[aria-label="Close"]',
            '[data-testid="cookie-policy-manage-dialog-accept-button"]',
            'div[role="dialog"] [aria-label="Close"]',
        ]:
            try:
                btn = page.query_selector(selector)
                if btn:
                    btn.click()
                    human_pause(0.4, 0.9)
            except Exception:
                pass

        # Page name
        name = ""
        for sel in ['h1', '[data-testid="page-title"]']:
            try:
                el = page.query_selector(sel)
                if el:
                    candidate = el.inner_text().strip()
                    if candidate and candidate.lower() not in ("facebook", ""):
                        name = candidate
                        break
            except Exception:
                pass

        if not name:
            try:
                t = page.title()
                # Facebook page titles: "Brand Name | City" or "Brand Name - Facebook"
                name = re.split(r'\s*[-|]\s*(?:Facebook)?$', t)[0].strip()
                if not name or name.lower() == "facebook":
                    name = ""
            except Exception:
                pass

        # Follower / like count — try multiple patterns including JSON blobs
        follower_count = 0
        try:
            content = page.content()
            for pattern in [
                r'([\d,.]+[KMk]?)\s*(followers|likes|people like)',
                r'([\d,.]+[KMk]?)\s*people follow',
                r'"follower_count"\s*:\s*(\d+)',
                r'"fan_count"\s*:\s*(\d+)',
                r'"like_count"\s*:\s*(\d+)',
                r'followers_count\\?":\s*(\d+)',
            ]:
                m = re.search(pattern, content, re.IGNORECASE)
                if m:
                    follower_count = parse_follower_count(m.group(1) if m.lastindex == 1 else m.group(0))
                    if follower_count > 0:
                        break
        except Exception:
            pass

        # Bio / about
        bio = ""
        for sel in [
            '[data-testid="page-about-section"]',
            'div[data-pagelet*="About"]',
            'div[class*="about"]',
        ]:
            try:
                el = page.query_selector(sel)
                if el:
                    bio = el.inner_text().strip()[:500]
                    if bio:
                        break
            except Exception:
                pass
        if not bio:
            try:
                meta = page.query_selector('meta[name="description"]')
                if meta:
                    bio = (meta.get_attribute("content") or "").strip()
            except Exception:
                pass

        # External website — look for the brand's own domain, not FB assets
        website = ""
        try:
            content = page.content()
            urls = re.findall(r'href="(https?://[^"]+)"', content)
            skip_domains = (
                "facebook.com", "fbcdn.net", "fb.com", "fb.me",
                "instagram.com", "twitter.com", "x.com",
                "wa.me", "whatsapp.com", "youtube.com", "tiktok.com",
                "google.com", "apple.com", "linktr.ee", "bit.ly",
                "amazon.com", "flipkart.com", "snapdeal.com",
            )
            skip_extensions = (".ico", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".css", ".js", ".woff")
            for url in urls:
                url_clean = url.split("?")[0].rstrip("/")
                if any(d in url_clean for d in skip_domains):
                    continue
                if any(url_clean.endswith(ext) for ext in skip_extensions):
                    continue
                # Must look like a real domain (has a dot, reasonable TLD)
                if re.search(r'\.[a-z]{2,6}(/|$)', url_clean, re.IGNORECASE):
                    website = url_clean
                    break
        except Exception:
            pass

        # City detection
        city = ""
        try:
            content = page.content()
            for city_name in [
                "Mumbai", "Delhi", "Bangalore", "Bengaluru", "Hyderabad",
                "Chennai", "Kolkata", "Jaipur", "Surat", "Pune", "Ahmedabad",
                "Lucknow", "Amritsar", "Varanasi", "Udaipur", "Jodhpur",
                "Chandigarh", "Kochi", "Bhubaneswar", "Indore", "Nagpur",
            ]:
                if city_name.lower() in content.lower():
                    city = city_name
                    break
        except Exception:
            pass

        # Niche tags from bio
        niche_map = {
            "saree": "sarees", "sari": "sarees", "lehenga": "lehengas",
            "kurta": "kurtas", "kurti": "kurtas", "ethnic": "ethnic wear",
            "handloom": "handloom", "sustainable": "sustainable fashion",
            "streetwear": "streetwear", "bridal": "bridal wear",
            "kids": "kidswear", "children": "kidswear",
            "silk": "silk", "cotton": "cotton", "organic": "organic",
            "block print": "block print", "bandhani": "bandhani",
            "khadi": "khadi", "fusion": "fusion wear", "western": "indo-western",
            "shirt": "shirts", "printed": "printed wear", "denim": "denim",
        }
        combined = bio.lower()
        niches = list({v for k, v in niche_map.items() if k in combined}) or ["fashion"]

        handle = "@" + page_url.rstrip("/").split("/")[-1]
        seed = (name[:2].upper() or "FB")

        return {
            "brandName": name or handle,
            "handle": handle,
            "platform": "facebook",
            "avatar": f"https://api.dicebear.com/9.x/initials/svg?seed={seed}&backgroundColor=818cf8&fontColor=ffffff",
            "bio": bio[:400] or "Fashion brand on Facebook",
            "followerCount": follower_count,
            "website": website or None,
            "email": None,
            "city": city or "India",
            "state": "",
            "niches": niches[:4],
            "posts": [],
            "hasWebsite": bool(website),
            "hasEmail": False,
            "pageUrl": page_url,
        }

    except Exception as e:
        print(f"[scraper] Page extract error for {page_url}: {e}", flush=True)
        return {}


# ── Main discovery thread ───────────────────────────────────────────────────

def _run_discovery(search_terms: list, filters: dict, max_per_term: int, msg_q: queue.Queue):
    import sys, asyncio, time

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    def progress(msg, found=0, total=0):
        msg_q.put(("progress", {"message": msg, "found": found, "total": total}))

    if not session_exists("facebook"):
        msg_q.put(("error", "No Facebook session found. Please connect your account in Settings first."))
        return

    all_leads = []
    seen_urls = set()
    lead_id_counter = [1000]

    try:
        with sync_playwright() as p:
            # One context for DuckDuckGo search (no session needed)
            search_ctx = make_context(p)
            search_page = search_ctx.new_page()

            # Separate context with saved FB session for profile extraction
            fb_ctx = make_context(p, user_data_dir=session_path("facebook"))
            detail_page = fb_ctx.new_page()

            # ── Step 1: Discover page URLs via DuckDuckGo ──────────────────
            all_page_urls = []
            for term in search_terms:
                urls = search_facebook_pages_via_duckduckgo(search_page, term, max_per_term, msg_q)
                for url in urls:
                    if url not in seen_urls:
                        seen_urls.add(url)
                        all_page_urls.append(url)
                progress(
                    f"Found {len(all_page_urls)} unique pages so far...",
                    found=len(all_leads),
                    total=len(all_page_urls),
                )
                human_pause(2, 4)  # Pause between search terms

            search_ctx.close()

            if not all_page_urls:
                progress("No pages found. Try different search terms.", found=0, total=0)
                msg_q.put(("complete", 0))
                fb_ctx.close()
                return

            # ── Step 2: Visit each Facebook page and extract data ───────────
            progress(
                f"Extracting profile data from {len(all_page_urls)} pages...",
                found=0,
                total=len(all_page_urls),
            )

            min_followers = filters.get("min_followers", 0)
            must_have_website = filters.get("must_have_website", False)

            for i, page_url in enumerate(all_page_urls):
                progress(
                    f"Reading profile {i + 1}/{len(all_page_urls)}: {page_url.rstrip('/').split('/')[-1]}",
                    found=len(all_leads),
                    total=len(all_page_urls),
                )

                details = extract_facebook_page_details_sync(detail_page, page_url)

                if not details or not details.get("brandName"):
                    continue
                # Only filter on follower count if we actually extracted one
                if details["followerCount"] > 0 and details["followerCount"] < min_followers:
                    continue
                if must_have_website and not details["hasWebsite"]:
                    continue

                lead_id_counter[0] += 1
                details["id"] = str(lead_id_counter[0])
                details["status"] = "new"
                details["selected"] = True
                details["discoveredAt"] = datetime.datetime.utcnow().isoformat() + "Z"
                details["personalizedMessage"] = None
                details["outreachStatus"] = None

                all_leads.append(details)
                msg_q.put(("lead", details))

                # Human-like delay between page visits
                human_pause(3, 7)

            fb_ctx.close()

        msg_q.put(("complete", len(all_leads)))

    except Exception as e:
        print(f"[scraper] Discovery error: {e}", flush=True)
        msg_q.put(("error", str(e)))


# ── Async bridge (sync thread → async WebSocket) ───────────────────────────

async def discover_facebook_leads(
    search_terms: list,
    filters: dict,
    on_progress=None,
    on_lead_found=None,
    max_per_term: int = 15,
) -> list:
    msg_q: queue.Queue = queue.Queue()

    thread = threading.Thread(
        target=_run_discovery,
        args=(search_terms, filters, max_per_term, msg_q),
        daemon=True,
    )
    thread.start()

    all_leads = []
    idle_ticks = 0  # counts 0.5s ticks with no queue activity

    while True:
        try:
            event_type, value = msg_q.get_nowait()
            idle_ticks = 0  # reset on activity

            if event_type == "progress" and on_progress:
                try:
                    await on_progress(value)
                except Exception:
                    pass
            elif event_type == "lead":
                all_leads.append(value)
                if on_lead_found:
                    try:
                        await on_lead_found(value)
                    except Exception:
                        pass
            elif event_type in ("complete", "error"):
                if event_type == "error" and on_progress:
                    try:
                        await on_progress({"message": f"Error: {value}", "found": 0, "total": 0})
                    except Exception:
                        pass
                break

        except queue.Empty:
            if not thread.is_alive() and msg_q.empty():
                break

            idle_ticks += 1
            # Send a keepalive ping every 10 seconds (20 × 0.5s) so the
            # WebSocket doesn't time out during slow Facebook page loads
            if idle_ticks % 20 == 0 and on_progress:
                try:
                    await on_progress({"message": "Extracting page data...", "found": len(all_leads), "total": 0})
                except Exception:
                    pass

            await asyncio.sleep(0.5)

    thread.join(timeout=10)
    return all_leads


# ── Instagram scraping ─────────────────────────────────────────────────────

SKIP_IG_PATHS = {
    "explore", "accounts", "reels", "p", "tv", "stories", "directory",
    "about", "developer", "directory", "legal", "help", "press",
    "api", "challenge", "session", "emails", "fxcal",
}


def is_valid_ig_profile_url(url: str) -> bool:
    url = url.split("?")[0].rstrip("/")
    path = url.replace("https://www.instagram.com", "").replace("https://instagram.com", "")
    if not path or path == "/":
        return False
    parts = [p for p in path.split("/") if p]
    if not parts:
        return False
    if parts[0] in SKIP_IG_PATHS:
        return False
    # Should look like a single username, not a post URL
    if len(parts) > 1:
        return False
    return True


def search_instagram_via_duckduckgo(page, search_term: str, max_results: int, msg_q: queue.Queue) -> list:
    """Search DuckDuckGo for Instagram profile URLs."""
    keyword = normalize_term(search_term)
    query = f'site:instagram.com "{keyword}" india'
    search_url = f"https://duckduckgo.com/html/?q={quote_plus(query)}&kl=in-en"

    msg_q.put(("progress", {"message": f'Discovering Instagram for "{keyword}"...', "found": 0, "total": 0}))
    print(f"[scraper] IG DDG search: {search_url}", flush=True)

    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
        human_pause(2, 4)
        human_mouse_wander(page)
    except Exception as e:
        print(f"[scraper] IG DDG nav error: {e}", flush=True)
        return []

    ig_urls = set()

    for sel in ["a.result__a", "a.result__url", 'a[href*="instagram.com"]']:
        try:
            for link in page.query_selector_all(sel):
                raw = (link.get_attribute("href") or "").strip()
                if "duckduckgo.com/l/" in raw or raw.startswith("/l/"):
                    qs = parse_qs(urlparse(raw).query)
                    raw = unquote(qs.get("uddg", [""])[0])
                if "instagram.com" not in raw:
                    continue
                raw = raw.split("?")[0].rstrip("/")
                if is_valid_ig_profile_url(raw):
                    ig_urls.add(raw)
        except Exception:
            continue

    # Regex fallback
    try:
        content = page.content()
        for match in re.findall(r'instagram\.com/([A-Za-z0-9._]+)/?', content):
            if match and match not in SKIP_IG_PATHS:
                ig_urls.add(f"https://www.instagram.com/{match}")
    except Exception:
        pass

    results = list(ig_urls)[:max_results]
    print(f"[scraper] '{keyword}' → {len(results)} Instagram URLs via DDG", flush=True)
    return results


def extract_instagram_profile_sync(page, profile_url: str) -> dict:
    """Extracts profile data from a public Instagram page."""
    try:
        print(f"[scraper] IG visiting: {profile_url}", flush=True)
        page.goto(profile_url, wait_until="domcontentloaded", timeout=25_000)
        title = page.title()
        print(f"[scraper] IG landed: {profile_url} | Title: '{title}'", flush=True)
        human_pause(2, 4)
        human_mouse_wander(page)

        username = profile_url.rstrip("/").split("/")[-1]
        handle = f"@{username}"

        # Brand name from page title: "Brand Name (@handle) • Instagram photos and videos"
        name = ""
        try:
            t = page.title()
            m = re.match(r'^(.*?)\s*\(@', t)
            if m:
                name = m.group(1).strip()
            if not name:
                name = t.replace("• Instagram photos and videos", "").strip()
        except Exception:
            pass

        content = page.content()

        # Bio + follower count from meta description: "X Followers, Y Following, Z Posts — bio"
        bio = ""
        follower_count = 0
        try:
            meta = page.query_selector('meta[name="description"]')
            if meta:
                desc = meta.get_attribute("content") or ""
                bio = desc
                m = re.search(r'([\d,.]+[KMk]?)\s*Followers', desc, re.IGNORECASE)
                if m:
                    follower_count = parse_follower_count(m.group(1))
        except Exception:
            pass

        # External website from bio area
        website = ""
        try:
            urls = re.findall(r'href="(https?://[^"]+)"', content)
            skip = ("instagram.com", "facebook.com", "fbcdn.net", "cdninstagram.com",
                    "wa.me", "linktr.ee", "youtube.com", "twitter.com", "x.com")
            for url in urls:
                clean = url.split("?")[0]
                if any(s in clean for s in skip):
                    continue
                if any(clean.endswith(ext) for ext in (".ico", ".png", ".jpg", ".css", ".js")):
                    continue
                if re.search(r'\.[a-z]{2,6}(/|$)', clean, re.IGNORECASE):
                    website = clean
                    break
        except Exception:
            pass

        # Niche tags from bio
        niche_map = {
            "saree": "sarees", "lehenga": "lehengas", "kurta": "kurtas",
            "ethnic": "ethnic wear", "handloom": "handloom",
            "sustainable": "sustainable fashion", "streetwear": "streetwear",
            "bridal": "bridal wear", "kids": "kidswear",
            "silk": "silk", "khadi": "khadi", "shirt": "shirts",
        }
        combined = bio.lower()
        niches = list({v for k, v in niche_map.items() if k in combined}) or ["fashion"]

        seed = (name[:2].upper() or "IG")

        return {
            "brandName": name or handle,
            "handle": handle,
            "platform": "instagram",
            "avatar": f"https://api.dicebear.com/9.x/initials/svg?seed={seed}&backgroundColor=ec4899&fontColor=ffffff",
            "bio": bio[:400] or "Indian fashion brand on Instagram",
            "followerCount": follower_count,
            "website": website or None,
            "email": None,
            "city": "India",
            "state": "",
            "niches": niches[:4],
            "posts": [],
            "hasWebsite": bool(website),
            "hasEmail": False,
            "pageUrl": profile_url,
        }

    except Exception as e:
        print(f"[scraper] IG extract error for {profile_url}: {e}", flush=True)
        return {}


def _run_instagram_discovery(search_terms: list, filters: dict, max_per_term: int, msg_q: queue.Queue):
    import sys, asyncio
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    def progress(msg, found=0, total=0):
        msg_q.put(("progress", {"message": msg, "found": found, "total": total}))

    use_session = session_exists("instagram")
    all_leads = []
    seen_urls = set()
    lead_id_counter = [2000]

    try:
        with sync_playwright() as p:
            search_ctx = make_context(p)
            search_page = search_ctx.new_page()

            ig_ctx = make_context(p, user_data_dir=session_path("instagram")) if use_session else make_context(p)
            detail_page = ig_ctx.new_page()

            # Discover URLs
            all_page_urls = []
            for term in search_terms:
                urls = search_instagram_via_duckduckgo(search_page, term, max_per_term, msg_q)
                for url in urls:
                    if url not in seen_urls:
                        seen_urls.add(url)
                        all_page_urls.append(url)
                progress(
                    f"Found {len(all_page_urls)} Instagram profiles so far...",
                    found=len(all_leads),
                    total=len(all_page_urls),
                )
                human_pause(2, 4)

            search_ctx.close()

            if not all_page_urls:
                progress("No Instagram profiles found.", found=0, total=0)
                msg_q.put(("complete", 0))
                ig_ctx.close()
                return

            progress(
                f"Extracting data from {len(all_page_urls)} Instagram profiles...",
                found=0,
                total=len(all_page_urls),
            )

            min_followers = filters.get("min_followers", 0)
            must_have_website = filters.get("must_have_website", False)

            for i, profile_url in enumerate(all_page_urls):
                progress(
                    f"Reading IG profile {i + 1}/{len(all_page_urls)}: {profile_url.rstrip('/').split('/')[-1]}",
                    found=len(all_leads),
                    total=len(all_page_urls),
                )

                details = extract_instagram_profile_sync(detail_page, profile_url)

                if not details or not details.get("brandName"):
                    continue
                if details["followerCount"] > 0 and details["followerCount"] < min_followers:
                    continue
                if must_have_website and not details["hasWebsite"]:
                    continue

                lead_id_counter[0] += 1
                details["id"] = str(lead_id_counter[0])
                details["status"] = "new"
                details["selected"] = True
                details["discoveredAt"] = datetime.datetime.utcnow().isoformat() + "Z"
                details["personalizedMessage"] = None
                details["outreachStatus"] = None

                all_leads.append(details)
                msg_q.put(("lead", details))

                human_pause(3, 7)

            ig_ctx.close()

        msg_q.put(("complete", len(all_leads)))

    except Exception as e:
        print(f"[scraper] IG discovery error: {e}", flush=True)
        msg_q.put(("error", str(e)))


async def discover_instagram_leads(
    search_terms: list,
    filters: dict,
    on_progress=None,
    on_lead_found=None,
    max_per_term: int = 15,
) -> list:
    msg_q: queue.Queue = queue.Queue()

    thread = threading.Thread(
        target=_run_instagram_discovery,
        args=(search_terms, filters, max_per_term, msg_q),
        daemon=True,
    )
    thread.start()

    all_leads = []
    idle_ticks = 0

    while True:
        try:
            event_type, value = msg_q.get_nowait()
            idle_ticks = 0

            if event_type == "progress" and on_progress:
                try:
                    await on_progress(value)
                except Exception:
                    pass
            elif event_type == "lead":
                all_leads.append(value)
                if on_lead_found:
                    try:
                        await on_lead_found(value)
                    except Exception:
                        pass
            elif event_type in ("complete", "error"):
                if event_type == "error" and on_progress:
                    try:
                        await on_progress({"message": f"Error: {value}", "found": 0, "total": 0})
                    except Exception:
                        pass
                break

        except queue.Empty:
            if not thread.is_alive() and msg_q.empty():
                break
            idle_ticks += 1
            if idle_ticks % 20 == 0 and on_progress:
                try:
                    await on_progress({"message": "Reading Instagram profile...", "found": len(all_leads), "total": 0})
                except Exception:
                    pass
            await asyncio.sleep(0.5)

    thread.join(timeout=10)
    return all_leads
