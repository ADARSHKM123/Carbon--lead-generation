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


def extract_contact_info(content: str) -> dict:
    """Pull email, phone, and WhatsApp from raw page HTML."""
    info = {"email": None, "phone": None, "whatsapp": None}

    # Email — prefer explicit mailto: links, fall back to plain email regex
    try:
        mailto = re.search(r'mailto:([^"\'\s<>]+@[^"\'\s<>]+)', content, re.IGNORECASE)
        if mailto:
            info["email"] = mailto.group(1).strip()
        else:
            skip_email_substrings = (
                "@example.", "@noreply", "@no-reply", "@facebook.com", "@instagram.com",
                "@fbcdn.net", "@cdninstagram", ".png", ".jpg", ".gif", "@sentry",
                "support@fb", "help@fb",
            )
            for candidate in re.findall(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', content):
                if not any(s in candidate.lower() for s in skip_email_substrings):
                    info["email"] = candidate
                    break
    except Exception:
        pass

    # Phone — tel: hrefs are most reliable
    try:
        tel = re.search(r'tel:([+\d][\d\s()\-+]{6,20})', content)
        if tel:
            info["phone"] = re.sub(r'\s+', ' ', tel.group(1)).strip()
    except Exception:
        pass

    # WhatsApp — wa.me or api.whatsapp.com/send?phone=
    try:
        wa = re.search(r'wa\.me/(\+?\d{6,15})', content)
        if not wa:
            wa = re.search(r'api\.whatsapp\.com/send\?phone=(\+?\d{6,15})', content)
        if wa:
            info["whatsapp"] = wa.group(1).strip()
    except Exception:
        pass

    return info


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

        # Contact info — first scrape from main page content,
        # then try the contact_and_basic_info page for richer data
        try:
            main_content = page.content()
        except Exception:
            main_content = ""
        contact = extract_contact_info(main_content)
        try:
            contact_url = page_url.rstrip("/") + "/about_contact_and_basic_info"
            page.goto(contact_url, wait_until="domcontentloaded", timeout=15_000)
            human_pause(1.5, 3)
            extra_contact = extract_contact_info(page.content())
            for k, v in extra_contact.items():
                if v and not contact.get(k):
                    contact[k] = v
        except Exception:
            pass

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
            "email": contact["email"],
            "phone": contact["phone"],
            "whatsapp": contact["whatsapp"],
            "city": city or "India",
            "state": "",
            "niches": niches[:4],
            "posts": [],
            "hasWebsite": bool(website),
            "hasEmail": bool(contact["email"]),
            "hasPhone": bool(contact["phone"]),
            "hasWhatsapp": bool(contact["whatsapp"]),
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

        # Contact info from public IG profile (email/phone buttons + bio text)
        contact = extract_contact_info(content)
        # Also scan bio meta description specifically — IG often shows email there
        if not contact["email"] and bio:
            bio_contact = extract_contact_info(bio)
            for k, v in bio_contact.items():
                if v and not contact.get(k):
                    contact[k] = v

        seed = (name[:2].upper() or "IG")

        return {
            "brandName": name or handle,
            "handle": handle,
            "platform": "instagram",
            "avatar": f"https://api.dicebear.com/9.x/initials/svg?seed={seed}&backgroundColor=ec4899&fontColor=ffffff",
            "bio": bio[:400] or "Indian fashion brand on Instagram",
            "followerCount": follower_count,
            "website": website or None,
            "email": contact["email"],
            "phone": contact["phone"],
            "whatsapp": contact["whatsapp"],
            "city": "India",
            "state": "",
            "niches": niches[:4],
            "posts": [],
            "hasWebsite": bool(website),
            "hasEmail": bool(contact["email"]),
            "hasPhone": bool(contact["phone"]),
            "hasWhatsapp": bool(contact["whatsapp"]),
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

    all_leads = []
    seen_urls = set()
    lead_id_counter = [2000]

    try:
        with sync_playwright() as p:
            # Both contexts are anonymous — Instagram flags logged-in accounts
            # much more aggressively for automation. Saved IG session is reserved
            # for DM sending only, never used during discovery.
            search_ctx = make_context(p)
            search_page = search_ctx.new_page()

            ig_ctx = make_context(p)
            detail_page = ig_ctx.new_page()

            # Warmup: visit instagram.com home like a normal user would,
            # then dismiss any popups, before hitting profile pages.
            try:
                print("[scraper] IG warmup: visiting home", flush=True)
                detail_page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=20_000)
                human_pause(3, 6)
                human_mouse_wander(detail_page)
                human_scroll(detail_page, 400)
                human_pause(2, 4)
            except Exception as e:
                print(f"[scraper] IG warmup skipped: {e}", flush=True)

            # Discover URLs via DuckDuckGo
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
                human_pause(3, 6)  # Slower pacing between search terms

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

                # After each profile: scroll + mouse wander like a human browsing
                try:
                    human_scroll(detail_page, random.randint(300, 700))
                    human_mouse_wander(detail_page)
                except Exception:
                    pass

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

                # Longer, more variable delays between IG profile visits
                # to avoid triggering rate-limiting on the anonymous browser
                human_pause(8, 15)

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


# ── LinkedIn scraping ──────────────────────────────────────────────────────

# LinkedIn keeps companies at /company/<slug> and people at /in/<slug>.
# Everything else is utility content we don't want to follow.
LI_KEEP_PREFIXES = ("/company/", "/in/", "/school/")
SKIP_LI_PATHS = {
    "/jobs", "/learning", "/feed", "/posts", "/pulse", "/news",
    "/showcase", "/legal", "/help", "/login", "/signup", "/checkpoint",
    "/uas", "/talent", "/sales", "/groups", "/events", "/services",
    "/today", "/directory", "/m/", "/redir",
}


def is_valid_linkedin_url(url: str) -> bool:
    url = url.split("?")[0].split("#")[0].rstrip("/")
    path = (
        url.replace("https://www.linkedin.com", "")
           .replace("https://linkedin.com", "")
           .replace("https://in.linkedin.com", "")
           .replace("https://india.linkedin.com", "")
    )
    if not path or path == "/":
        return False
    if any(path.startswith(s) for s in SKIP_LI_PATHS):
        return False
    if not any(path.startswith(s) for s in LI_KEEP_PREFIXES):
        return False
    # Must have a slug after the prefix
    parts = [p for p in path.split("/") if p]
    return len(parts) >= 2


def normalize_linkedin_url(url: str) -> str:
    """Strip subdomain variants like in.linkedin.com → www.linkedin.com."""
    url = url.split("?")[0].split("#")[0].rstrip("/")
    for variant in ("https://linkedin.com", "https://in.linkedin.com", "https://india.linkedin.com"):
        if url.startswith(variant):
            url = "https://www.linkedin.com" + url[len(variant):]
            break
    return url


def _is_blocked_page(page) -> bool:
    """Detect captcha / rate-limit / 'unusual traffic' pages from search engines."""
    try:
        content = page.content().lower()
    except Exception:
        return False
    indicators = [
        "error-lite@duckduckgo.com",
        "unusual traffic",
        "automated queries",
        "are you a robot",
        "captcha",
        "anomaly detected",
        "please verify you are a human",
    ]
    return any(s in content for s in indicators)


def _human_type(page, selector: str, text: str):
    """Type into a search box one character at a time with realistic jitter."""
    try:
        el = page.query_selector(selector)
        if not el:
            return False
        el.click()
        human_pause(0.3, 0.8)
        for ch in text:
            page.keyboard.type(ch)
            import time
            time.sleep(random.uniform(0.04, 0.18))
        human_pause(0.5, 1.2)
        return True
    except Exception:
        return False


def _extract_linkedin_urls_from_page(page) -> set:
    """Pull LinkedIn URLs from any search results page (DDG or Bing)."""
    li_urls = set()
    try:
        for link in page.query_selector_all('a[href]'):
            raw = (link.get_attribute("href") or "").strip()
            # DDG redirect wrapper
            if "duckduckgo.com/l/" in raw or raw.startswith("/l/"):
                qs = parse_qs(urlparse(raw).query)
                raw = unquote(qs.get("uddg", [""])[0])
            # Bing redirect wrapper (bing.com/ck/a?...&u=<encoded>)
            if "bing.com/ck/a" in raw:
                qs = parse_qs(urlparse(raw).query)
                u = qs.get("u", [""])[0]
                if u:
                    raw = unquote(u)
                    # Bing prefixes encoded URLs with "a1"
                    if raw.startswith("a1"):
                        try:
                            import base64
                            raw = base64.b64decode(raw[2:] + "===").decode("utf-8", errors="ignore")
                        except Exception:
                            pass
            if "linkedin.com" not in raw:
                continue
            raw = normalize_linkedin_url(raw)
            if is_valid_linkedin_url(raw):
                li_urls.add(raw)
    except Exception:
        pass

    # Regex fallback over the raw HTML
    try:
        content = page.content()
        for match in re.findall(
            r'https?://(?:www\.|in\.|india\.)?linkedin\.com/(company|in|school)/([A-Za-z0-9._\-]+)',
            content,
        ):
            kind, slug = match
            url = f"https://www.linkedin.com/{kind}/{slug}"
            if is_valid_linkedin_url(url):
                li_urls.add(url)
    except Exception:
        pass

    return li_urls


def search_linkedin_via_duckduckgo(page, search_term: str, max_results: int, msg_q: queue.Queue) -> list:
    """
    Search for LinkedIn pages via DuckDuckGo (with human-like behavior),
    falling back to Bing if DDG blocks us.
    """
    keyword = normalize_term(search_term)
    msg_q.put(("progress", {"message": f'Discovering LinkedIn for "{keyword}"...', "found": 0, "total": 0}))

    # Simpler query — DDG's parser hates the (company OR in) form.
    # /company/ + /in/ + /school/ filtering happens downstream.
    query = f'site:linkedin.com "{keyword}" india'

    li_urls = set()
    ddg_worked = False

    # ── Try DuckDuckGo HTML endpoint (same approach that works for FB/IG) ──
    try:
        ddg_url = f"https://duckduckgo.com/html/?q={quote_plus(query)}&kl=in-en"
        print(f"[scraper] LI DDG: {ddg_url}", flush=True)
        page.goto(ddg_url, wait_until="domcontentloaded", timeout=30_000)
        human_pause(2.5, 4.5)
        human_mouse_wander(page)
        human_scroll(page, 500)
        human_pause(1, 2)

        title = page.title()
        print(f"[scraper] LI DDG title: '{title}'", flush=True)

        if _is_blocked_page(page):
            print("[scraper] LI DDG blocked — will try Bing", flush=True)
        else:
            li_urls = _extract_linkedin_urls_from_page(page)
            ddg_worked = len(li_urls) > 0
    except Exception as e:
        print(f"[scraper] LI DDG error: {e}", flush=True)

    # ── Fallback: Bing ─────────────────────────────────────────────────
    if not ddg_worked:
        try:
            print("[scraper] LI fallback: Bing", flush=True)
            bing_url = f"https://www.bing.com/search?q={quote_plus(query)}&cc=in&setlang=en"
            page.goto(bing_url, wait_until="domcontentloaded", timeout=30_000)
            # Bing often redirects + lazy-loads — wait for the network to settle
            try:
                page.wait_for_load_state("networkidle", timeout=10_000)
            except Exception:
                pass
            human_pause(2.5, 4.5)
            human_mouse_wander(page)
            human_scroll(page, 600)
            human_pause(1, 2)

            title = page.title()
            print(f"[scraper] LI Bing title: '{title}'", flush=True)

            if _is_blocked_page(page):
                print("[scraper] LI Bing blocked", flush=True)
            else:
                bing_urls = _extract_linkedin_urls_from_page(page)
                print(f"[scraper] LI Bing found: {len(bing_urls)} URLs", flush=True)
                li_urls.update(bing_urls)
        except Exception as e:
            print(f"[scraper] LI Bing error: {e}", flush=True)

    # ── Last resort: Google ────────────────────────────────────────────
    if len(li_urls) == 0:
        try:
            print("[scraper] LI last resort: Google", flush=True)
            google_url = f"https://www.google.com/search?q={quote_plus(query)}&hl=en&gl=in"
            page.goto(google_url, wait_until="domcontentloaded", timeout=30_000)
            try:
                page.wait_for_load_state("networkidle", timeout=10_000)
            except Exception:
                pass
            human_pause(2.5, 4.5)
            human_mouse_wander(page)
            human_scroll(page, 600)

            title = page.title()
            print(f"[scraper] LI Google title: '{title}'", flush=True)

            if _is_blocked_page(page):
                print("[scraper] LI Google blocked", flush=True)
            else:
                google_urls = _extract_linkedin_urls_from_page(page)
                print(f"[scraper] LI Google found: {len(google_urls)} URLs", flush=True)
                li_urls.update(google_urls)
        except Exception as e:
            print(f"[scraper] LI Google error: {e}", flush=True)

    results = list(li_urls)[:max_results]
    print(f"[scraper] '{keyword}' → {len(results)} LinkedIn URLs", flush=True)
    if results:
        print(f"[scraper] LI sample: {results[:3]}", flush=True)
    return results


def extract_linkedin_profile_sync(page, profile_url: str) -> dict:
    """
    Extracts data from a public LinkedIn page.
    Without login LinkedIn shows mostly OG/meta tags + a sign-in wall,
    but that's enough for: name, headline/description, location,
    company logo, and follower count for company pages.
    """
    try:
        print(f"[scraper] LI visiting: {profile_url}", flush=True)
        page.goto(profile_url, wait_until="domcontentloaded", timeout=25_000)
        human_pause(2, 4)
        human_mouse_wander(page)
        title = page.title()
        print(f"[scraper] LI landed: {profile_url} | Title: '{title}'", flush=True)

        content = page.content()
        is_company = "/company/" in profile_url
        is_school = "/school/" in profile_url
        slug = profile_url.rstrip("/").split("/")[-1]
        handle = f"@{slug}"

        # Name — from page title or og:title
        name = ""
        try:
            og_title = page.query_selector('meta[property="og:title"]')
            if og_title:
                name = (og_title.get_attribute("content") or "").strip()
            if not name:
                # Strip " | LinkedIn" suffix from window title
                name = re.split(r'\s*[-|]\s*LinkedIn', title)[0].strip()
        except Exception:
            pass

        # Bio / headline — meta description
        bio = ""
        try:
            meta = page.query_selector('meta[name="description"]')
            if meta:
                bio = (meta.get_attribute("content") or "").strip()
            if not bio:
                og_desc = page.query_selector('meta[property="og:description"]')
                if og_desc:
                    bio = (og_desc.get_attribute("content") or "").strip()
        except Exception:
            pass

        # Follower count — LinkedIn shows it in JSON/text as "X followers"
        follower_count = 0
        for pattern in [
            r'([\d,.]+[KMk]?)\s*followers',
            r'"followerCount"\s*:\s*(\d+)',
            r'"followers"\s*:\s*\{[^}]*"count"\s*:\s*(\d+)',
        ]:
            try:
                m = re.search(pattern, content, re.IGNORECASE)
                if m:
                    follower_count = parse_follower_count(m.group(1))
                    if follower_count > 0:
                        break
            except Exception:
                pass

        # Location / city — LinkedIn often surfaces this in meta or json
        city = ""
        try:
            for city_name in [
                "Mumbai", "Delhi", "New Delhi", "Bangalore", "Bengaluru", "Hyderabad",
                "Chennai", "Kolkata", "Jaipur", "Surat", "Pune", "Ahmedabad",
                "Lucknow", "Gurugram", "Gurgaon", "Noida", "Chandigarh", "Indore",
            ]:
                if city_name.lower() in (bio + " " + content[:5000]).lower():
                    city = city_name.replace("Gurgaon", "Gurugram")
                    break
        except Exception:
            pass

        # External website — for company pages LinkedIn lists the brand site
        website = ""
        try:
            urls = re.findall(r'href="(https?://[^"]+)"', content)
            skip = (
                "linkedin.com", "licdn.com", "facebook.com", "fbcdn.net",
                "instagram.com", "wa.me", "youtube.com", "twitter.com", "x.com",
                "google.com", "apple.com",
            )
            for url in urls:
                clean = url.split("?")[0]
                if any(s in clean for s in skip):
                    continue
                if any(clean.endswith(ext) for ext in (".ico", ".png", ".jpg", ".css", ".js", ".woff")):
                    continue
                if re.search(r'\.[a-z]{2,6}(/|$)', clean, re.IGNORECASE):
                    website = clean
                    break
        except Exception:
            pass

        # Contact info from page content (rare on LinkedIn but possible from bio)
        contact = extract_contact_info(content)
        if not contact["email"] and bio:
            bio_contact = extract_contact_info(bio)
            for k, v in bio_contact.items():
                if v and not contact.get(k):
                    contact[k] = v

        # Niche tags from bio
        niche_map = {
            "saree": "sarees", "lehenga": "lehengas", "kurta": "kurtas",
            "ethnic": "ethnic wear", "handloom": "handloom",
            "sustainable": "sustainable fashion", "streetwear": "streetwear",
            "bridal": "bridal wear", "kids": "kidswear",
            "silk": "silk", "khadi": "khadi", "shirt": "shirts",
            "founder": "founder", "designer": "designer", "stylist": "stylist",
        }
        combined = bio.lower()
        niches = list({v for k, v in niche_map.items() if k in combined}) or [
            "company" if is_company else ("school" if is_school else "founder/profile")
        ]

        seed = (name[:2].upper() or "LI")
        avatar_bg = "0a66c2"  # LinkedIn blue

        return {
            "brandName": name or handle,
            "handle": handle,
            "platform": "linkedin",
            "avatar": f"https://api.dicebear.com/9.x/initials/svg?seed={seed}&backgroundColor={avatar_bg}&fontColor=ffffff",
            "bio": (bio[:400] or ("LinkedIn company page" if is_company else "LinkedIn profile")),
            "followerCount": follower_count,
            "website": website or None,
            "email": contact["email"],
            "phone": contact["phone"],
            "whatsapp": contact["whatsapp"],
            "city": city or "India",
            "state": "",
            "niches": niches[:4],
            "posts": [],
            "hasWebsite": bool(website),
            "hasEmail": bool(contact["email"]),
            "hasPhone": bool(contact["phone"]),
            "hasWhatsapp": bool(contact["whatsapp"]),
            "pageUrl": profile_url,
            "linkedinType": "company" if is_company else ("school" if is_school else "person"),
        }

    except Exception as e:
        print(f"[scraper] LI extract error for {profile_url}: {e}", flush=True)
        return {}


def _run_linkedin_discovery(search_terms: list, filters: dict, max_per_term: int, msg_q: queue.Queue):
    import sys, asyncio
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    def progress(msg, found=0, total=0):
        msg_q.put(("progress", {"message": msg, "found": found, "total": total}))

    all_leads = []
    seen_urls = set()
    lead_id_counter = [3000]

    try:
        with sync_playwright() as p:
            # LinkedIn flags logged-in accounts the hardest — use anonymous
            # for discovery. Saved LI session is reserved for messaging only.
            search_ctx = make_context(p)
            search_page = search_ctx.new_page()

            li_ctx = make_context(p)
            detail_page = li_ctx.new_page()

            # Discover URLs
            all_page_urls = []
            for term in search_terms:
                urls = search_linkedin_via_duckduckgo(search_page, term, max_per_term, msg_q)
                for url in urls:
                    if url not in seen_urls:
                        seen_urls.add(url)
                        all_page_urls.append(url)
                progress(
                    f"Found {len(all_page_urls)} LinkedIn pages so far...",
                    found=len(all_leads),
                    total=len(all_page_urls),
                )
                human_pause(3, 6)

            search_ctx.close()

            if not all_page_urls:
                progress("No LinkedIn pages found.", found=0, total=0)
                msg_q.put(("complete", 0))
                li_ctx.close()
                return

            progress(
                f"Extracting data from {len(all_page_urls)} LinkedIn pages...",
                found=0,
                total=len(all_page_urls),
            )

            min_followers = filters.get("min_followers", 0)
            must_have_website = filters.get("must_have_website", False)

            for i, profile_url in enumerate(all_page_urls):
                progress(
                    f"Reading LinkedIn page {i + 1}/{len(all_page_urls)}: {profile_url.rstrip('/').split('/')[-1]}",
                    found=len(all_leads),
                    total=len(all_page_urls),
                )

                details = extract_linkedin_profile_sync(detail_page, profile_url)

                try:
                    human_scroll(detail_page, random.randint(300, 700))
                    human_mouse_wander(detail_page)
                except Exception:
                    pass

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

                # LinkedIn rate-limits aggressively — longer pauses
                human_pause(10, 18)

            li_ctx.close()

        msg_q.put(("complete", len(all_leads)))

    except Exception as e:
        print(f"[scraper] LI discovery error: {e}", flush=True)
        msg_q.put(("error", str(e)))


async def discover_linkedin_leads(
    search_terms: list,
    filters: dict,
    on_progress=None,
    on_lead_found=None,
    max_per_term: int = 15,
) -> list:
    msg_q: queue.Queue = queue.Queue()

    thread = threading.Thread(
        target=_run_linkedin_discovery,
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
                    await on_progress({"message": "Reading LinkedIn page...", "found": len(all_leads), "total": 0})
                except Exception:
                    pass
            await asyncio.sleep(0.5)

    thread.join(timeout=10)
    return all_leads
