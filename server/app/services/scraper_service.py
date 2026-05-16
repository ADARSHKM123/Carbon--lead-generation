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
import html
import queue
import random
import re
import threading
from urllib.parse import quote_plus, unquote, urlparse, parse_qs
try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

try:
    from app.services.session_service import session_path, session_exists
except ImportError:
    session_path = lambda p: ""
    session_exists = lambda p: False


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


STATIC_URL_EXTENSIONS = (
    ".ico", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".css", ".js",
    ".woff", ".woff2", ".ttf", ".webp", ".avif", ".mp4", ".webm",
)

PLATFORM_INFRA_DOMAINS = (
    "facebook.com", "fb.com", "fb.me", "fbcdn.net",
    "instagram.com", "cdninstagram.com",
    "about.meta.com", "meta.com", "developers.facebook.com",
    "help.instagram.com", "privacycenter.instagram.com",
)

NON_WEBSITE_CONTACT_DOMAINS = (
    "wa.me", "whatsapp.com", "api.whatsapp.com",
)

SOCIAL_PROFILE_DOMAINS = (
    "twitter.com", "x.com", "youtube.com", "youtu.be", "tiktok.com",
    "threads.net", "threads.com", "linkedin.com", "pinterest.com",
    "snapchat.com", "telegram.me", "t.me",
)


def _decode_text_blob(content: str) -> str:
    """Make escaped HTML/JSON snippets searchable without changing meaning."""
    if not content:
        return ""
    text = html.unescape(str(content))
    text = text.replace("\\/", "/").replace("\\n", "\n").replace("\\t", " ")
    text = text.replace("\\u0026", "&").replace("\\u003d", "=").replace("\\u002f", "/")
    text = text.replace("\\u002B", "+").replace("\\u003A", ":")
    return text


def _normalize_phone_candidate(value: str) -> str | None:
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if digits.startswith("91") and len(digits) == 12 and digits[2] in "6789":
        return "+91" + digits[2:]
    if len(digits) == 10 and digits[0] in "6789":
        return digits
    if 8 <= len(digits) <= 15 and value.strip().startswith("+"):
        return "+" + digits
    return None


def _find_labeled_phone(text: str, label_regex: str) -> str | None:
    pattern = rf"(?i)(?:{label_regex})\s*(?:us|now)?\s*(?:[:=\-–—]|\s)\s*(\+?[\d][\d\s().\-+]{{7,24}}\d)"
    for match in re.finditer(pattern, text):
        phone = _normalize_phone_candidate(match.group(1))
        if phone:
            return phone
    return None


def _find_plain_phone(text: str, allow_unlabeled: bool = False) -> str | None:
    phone = _find_labeled_phone(
        text,
        r"contact|call|phone|mobile|mob|tel|telephone|ph|enquir(?:y|ies)|order|booking",
    )
    if phone:
        return phone
    if allow_unlabeled:
        for match in re.finditer(r"(?<!\d)(?:\+?91[\s\-]?)?[6-9]\d{9}(?!\d)", text):
            phone = _normalize_phone_candidate(match.group(0))
            if phone:
                return phone
    return None


def _unwrap_redirect_url(raw_url: str) -> str:
    raw_url = _decode_text_blob(raw_url).strip()
    parsed = urlparse(raw_url)
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    if host in ("l.instagram.com", "l.facebook.com", "lm.facebook.com", "l.messenger.com"):
        qs = parse_qs(parsed.query)
        for key in ("u", "url"):
            if qs.get(key):
                return unquote(qs[key][0])
    return raw_url


def _normalize_url_candidate(raw_url: str, strip_query: bool = True) -> str | None:
    if not raw_url:
        return None
    url = _unwrap_redirect_url(raw_url)
    url = html.unescape(url).strip().strip("\"'<>[]()")
    url = re.sub(r"[),.;:]+$", "", url)
    if not url or url.startswith(("mailto:", "tel:")):
        return None
    if url.startswith("//"):
        url = "https:" + url
    if url.lower().startswith("www."):
        url = "https://" + url
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "https://" + url
    parsed = urlparse(url)
    if not parsed.netloc or "." not in parsed.netloc:
        return None
    if any(parsed.path.lower().endswith(ext) for ext in STATIC_URL_EXTENSIONS):
        return None
    domain = parsed.netloc.lower()
    if domain.startswith("www."):
        domain = domain[4:]
    if any(domain == item or domain.endswith("." + item) for item in NON_WEBSITE_CONTACT_DOMAINS):
        strip_query = False
    if strip_query:
        url = parsed._replace(query="", fragment="").geturl()
    else:
        url = parsed._replace(fragment="").geturl()
    return url.rstrip("/")


def _url_domain(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def _domain_matches(domain: str, blocked: tuple[str, ...]) -> bool:
    return any(domain == item or domain.endswith("." + item) for item in blocked)


def _is_profile_owned_url(url: str, allow_social: bool = True) -> bool:
    normalized = _normalize_url_candidate(url)
    if not normalized:
        return False
    domain = _url_domain(normalized)
    if _domain_matches(domain, PLATFORM_INFRA_DOMAINS):
        return False
    if not allow_social and _domain_matches(domain, SOCIAL_PROFILE_DOMAINS + NON_WEBSITE_CONTACT_DOMAINS):
        return False
    return True


def _is_primary_website_url(url: str) -> bool:
    normalized = _normalize_url_candidate(url)
    if not normalized:
        return False
    domain = _url_domain(normalized)
    blocked = PLATFORM_INFRA_DOMAINS + NON_WEBSITE_CONTACT_DOMAINS + SOCIAL_PROFILE_DOMAINS
    return not _domain_matches(domain, blocked)


def _dedupe_urls(urls: list[str], allow_social: bool = True) -> list[str]:
    seen = set()
    clean_urls = []
    for raw in urls:
        url = _normalize_url_candidate(raw)
        if not url or not _is_profile_owned_url(url, allow_social=allow_social):
            continue
        key = url.lower()
        if key in seen:
            continue
        seen.add(key)
        clean_urls.append(url)
    return clean_urls


def extract_urls_from_text(text: str) -> list[str]:
    """Extract visible URLs from bio/about text, including bare www domains."""
    if not text:
        return []
    text = _decode_text_blob(text)
    matches = [
        match.group(0)
        for match in re.finditer(r"(?i)\b(?:https?://|www\.)[^\s\"'<>]+", text)
    ]
    matches.extend(
        match.group(0)
        for match in re.finditer(
            r"(?i)(?<!@)\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
            r"(?:com|in|co|net|org|store|shop|boutique|fashion|io|ai|app)"
            r"(?:/[^\s\"'<>]*)?",
            text,
        )
    )
    return _dedupe_urls(matches, allow_social=True)


def _extract_json_string_values(content: str, key: str) -> list[str]:
    values = []
    patterns = [
        rf'"{re.escape(key)}"\s*:\s*"((?:[^"\\]|\\.)*?)"',
        rf'\\"{re.escape(key)}\\"\s*:\s*\\"((?:[^"\\]|\\.)*?)\\"',
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, content):
            value = _decode_text_blob(match.group(1)).strip()
            if value and value.lower() not in ("null", "none"):
                values.append(value)
    return values


def _extract_instagram_bio_links(content: str) -> list[str]:
    links = []
    for key in ("external_url", "external_lynx_url"):
        links.extend(_extract_json_string_values(content, key))

    # Newer Instagram embeds multi-link data under bio_links. Keep the scan
    # close to that key so unrelated JSON urls do not leak into lead data.
    for marker in ('"bio_links"', '\\"bio_links\\"'):
        start = 0
        while True:
            idx = content.find(marker, start)
            if idx == -1:
                break
            snippet = content[idx: idx + 6000]
            for key in ("url", "lynx_url"):
                links.extend(_extract_json_string_values(snippet, key))
            start = idx + len(marker)

    return _dedupe_urls(links, allow_social=True)


def _pick_primary_website(urls: list[str]) -> str:
    for url in _dedupe_urls(urls, allow_social=True):
        if _is_primary_website_url(url):
            return url
    return ""


def extract_contact_info(content: str) -> dict:
    """Pull email, phone, and WhatsApp from raw page HTML or bio text."""
    info = {"email": None, "phone": None, "whatsapp": None}
    searchable = _decode_text_blob(content)

    # Email — prefer explicit mailto: links, fall back to plain email regex
    try:
        mailto = re.search(r'mailto:([^"\'\s<>]+@[^"\'\s<>]+)', searchable, re.IGNORECASE)
        if mailto:
            info["email"] = mailto.group(1).strip()
        else:
            skip_email_substrings = (
                "@example.", "@noreply", "@no-reply", "@facebook.com", "@instagram.com",
                "@fbcdn.net", "@cdninstagram", ".png", ".jpg", ".gif", "@sentry",
                "support@fb", "help@fb",
            )
            for candidate in re.findall(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', searchable):
                if not any(s in candidate.lower() for s in skip_email_substrings):
                    info["email"] = candidate
                    break
    except Exception:
        pass

    # Phone — tel: hrefs are most reliable
    try:
        tel = re.search(r'tel:([+\d][\d\s()\-+]{6,24})', searchable)
        if tel:
            info["phone"] = _normalize_phone_candidate(tel.group(1)) or re.sub(r'\s+', ' ', tel.group(1)).strip()
    except Exception:
        pass

    # WhatsApp — wa.me or api.whatsapp.com/send?phone=
    try:
        wa = re.search(r'wa\.me/(\+?\d{6,15})', searchable)
        if not wa:
            wa = re.search(r'(?:api\.)?whatsapp\.com/send\?phone=(\+?\d{6,15})', searchable)
        if wa:
            info["whatsapp"] = _normalize_phone_candidate(wa.group(1)) or wa.group(1).strip()
        else:
            info["whatsapp"] = _find_labeled_phone(searchable, r"whats\s*app|whatsapp|wa")
    except Exception:
        pass

    if not info["phone"]:
        # Full HTML contains many unrelated numeric ids, so only allow completely
        # unlabeled numbers for short bio/about snippets. Labeled numbers are safe
        # in both page JSON and plain bio text.
        info["phone"] = _find_plain_phone(searchable, allow_unlabeled=len(searchable) < 5000)

    if info["whatsapp"] and not info["phone"]:
        info["phone"] = info["whatsapp"]

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

        # Bio / about — prefer FB's embedded JSON (more accurate than DOM scrape)
        bio = ""
        content_for_bio = ""
        try:
            content_for_bio = page.content()
        except Exception:
            pass
        # 1) JSON fields commonly used on FB pages
        for pattern in [
            r'"page_about_text"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*?)"',
            r'"about"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*?)"',
            r'"best_description"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*?)"',
            r'"page_description"\s*:\s*"((?:[^"\\]|\\.)*?)"',
            r'"description"\s*:\s*"((?:[^"\\]|\\.)*?)"',
        ]:
            try:
                m = re.search(pattern, content_for_bio)
                if m:
                    candidate = _decode_js_string(m.group(1)).strip()
                    if candidate and len(candidate) > 5:
                        bio = candidate
                        break
            except Exception:
                pass
        # 2) DOM about sections
        if not bio:
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
        # 3) Final fallback: meta description
        if not bio:
            try:
                meta = page.query_selector('meta[name="description"]')
                if meta:
                    bio = (meta.get_attribute("content") or "").strip()
            except Exception:
                pass

        # Category (e.g., "Clothing brand", "Local Business")
        category = ""
        try:
            content = page.content()
            for pattern in [
                r'"category_name"\s*:\s*"((?:[^"\\]|\\.)*?)"',
                r'"category"\s*:\s*"((?:[^"\\]|\\.)*?)"',
                r'"page_category"\s*:\s*"((?:[^"\\]|\\.)*?)"',
            ]:
                m = re.search(pattern, content)
                if m and m.group(1) and m.group(1).lower() not in ("none", "null"):
                    category = _decode_js_string(m.group(1)).strip()
                    if category:
                        break
        except Exception:
            pass

        # External website — JSON `website` field first, then anchor scan
        website = ""
        all_links = extract_urls_from_text(bio)
        try:
            content = page.content()
            # 1) JSON website field on FB pages
            for pattern in [
                r'"website"\s*:\s*"(https?://(?:[^"\\]|\\.)*?)"',
                r'"website_url"\s*:\s*"(https?://(?:[^"\\]|\\.)*?)"',
            ]:
                m = re.search(pattern, content)
                if m:
                    all_links.append(_decode_js_string(m.group(1)).strip())

            # 2) FB's l.facebook.com redirect wrapper for outbound links
            for raw_url in re.findall(r'href="(https?://l\.facebook\.com/[^"]+)"', content):
                all_links.append(raw_url)

            # 3) Generic anchor scan
            if not _pick_primary_website(all_links):
                urls = re.findall(r'href="(https?://[^"]+)"', content)
                for url in urls:
                    normalized = _normalize_url_candidate(url)
                    if normalized and _is_primary_website_url(normalized):
                        all_links.append(normalized)
                        break
        except Exception:
            pass

        all_links = _dedupe_urls(all_links, allow_social=True)
        website = _pick_primary_website(all_links)

        # Verified badge?
        is_verified = False
        try:
            content = page.content()
            m = re.search(r'"is_verified"\s*:\s*(true|false)', content)
            if m:
                is_verified = m.group(1) == "true"
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
        combined = (bio + " " + (category or "")).lower()
        niches = list({v for k, v in niche_map.items() if k in combined}) or ["fashion"]

        # Contact info — first scrape from main page content,
        # then try the contact_and_basic_info page for richer data
        try:
            main_content = page.content()
        except Exception:
            main_content = ""
        contact = extract_contact_info(main_content)
        if bio:
            bio_contact = extract_contact_info(bio)
            for k, v in bio_contact.items():
                if v and not contact.get(k):
                    contact[k] = v
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

        # Normalize website URL
        if website:
            website = website.strip().rstrip("/")
            if website and not website.startswith(("http://", "https://")):
                website = "https://" + website

        return {
            "brandName": name or handle,
            "handle": handle,
            "platform": "facebook",
            "avatar": f"https://api.dicebear.com/9.x/initials/svg?seed={seed}&backgroundColor=818cf8&fontColor=ffffff",
            "bio": (bio[:500] or "Fashion brand on Facebook"),
            "category": category or "",
            "followerCount": follower_count,
            "followingCount": 0,
            "postCount": 0,
            "isVerified": is_verified,
            "website": website or None,
            "bioLinks": all_links,
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


def _decode_js_string(s: str) -> str:
    """Decode escape sequences from JSON strings embedded in <script> tags."""
    if not s:
        return ""
    try:
        # Handles é, \n, \", \\/ etc.
        return s.encode("utf-8").decode("unicode_escape", errors="ignore").replace("\\/", "/")
    except Exception:
        try:
            return s.replace("\\/", "/").replace('\\"', '"').replace("\\n", "\n")
        except Exception:
            return s


def _strip_ig_meta_prefix(desc: str) -> str:
    """
    Instagram's meta description looks like:
      "3,256 Followers, 4 Following, 186 Posts - HEZAK (@hezak_official) on Instagram: \"actual bio here\""
    This pulls out just the bio between the quotes after "on Instagram:".
    """
    if not desc:
        return ""
    # The quote character can be straight " or curly “ ”
    m = re.search(r'on Instagram[^:]*:\s*[\"“”](.*?)[\"“”]\s*$', desc, re.DOTALL)
    if m:
        return m.group(1).strip()
    # Fallback: strip the "X Followers, Y Following, Z Posts - Name (@handle) on Instagram:" prefix
    m = re.search(r'on Instagram[^:]*:\s*(.*)$', desc, re.DOTALL)
    if m:
        return m.group(1).strip().strip('"').strip("“").strip("”")
    return desc.strip()


def extract_instagram_profile_sync(page, profile_url: str) -> dict:
    """
    Extracts profile data from a public Instagram page.

    Instagram embeds the real profile data as JSON in <script> tags
    (biography, external_url, category_name, edge_followed_by, etc.).
    We parse those first — they're far more reliable than meta tags.
    """
    try:
        print(f"[scraper] IG visiting: {profile_url}", flush=True)
        page.goto(profile_url, wait_until="domcontentloaded", timeout=25_000)
        title = page.title()
        print(f"[scraper] IG landed: {profile_url} | Title: '{title}'", flush=True)
        human_pause(2, 4)
        human_mouse_wander(page)

        username = profile_url.rstrip("/").split("/")[-1]
        handle = f"@{username}"

        content = page.content()

        # ── Brand name ─────────────────────────────────────────────────
        name = ""
        # Prefer full_name from embedded JSON
        try:
            m = re.search(r'"full_name":"((?:[^"\\]|\\.)*?)"', content)
            if m:
                name = _decode_js_string(m.group(1)).strip()
        except Exception:
            pass
        # Fallback: og:title or page title
        if not name:
            try:
                og = page.query_selector('meta[property="og:title"]')
                if og:
                    raw = (og.get_attribute("content") or "").strip()
                    # "HEZAK - MODEST & ETHNIC WEAR (@hezak_official) • Instagram photos..."
                    mm = re.match(r'^(.*?)\s*\(@', raw)
                    name = (mm.group(1) if mm else raw).strip()
            except Exception:
                pass
        if not name:
            try:
                t = page.title()
                mm = re.match(r'^(.*?)\s*\(@', t)
                if mm:
                    name = mm.group(1).strip()
                else:
                    name = t.replace("• Instagram photos and videos", "").strip()
            except Exception:
                pass

        # ── Bio (the REAL one, not the meta prefix) ────────────────────
        bio = ""
        # 1) JSON biography field — most accurate
        try:
            m = re.search(r'"biography":"((?:[^"\\]|\\.)*?)"', content)
            if m:
                bio = _decode_js_string(m.group(1)).strip()
        except Exception:
            pass
        # 2) Strip prefix from meta description
        if not bio:
            try:
                meta = page.query_selector('meta[name="description"]')
                if meta:
                    desc = meta.get_attribute("content") or ""
                    bio = _strip_ig_meta_prefix(desc)
            except Exception:
                pass
        # 3) Final fallback to og:description
        if not bio:
            try:
                og_desc = page.query_selector('meta[property="og:description"]')
                if og_desc:
                    desc = og_desc.get_attribute("content") or ""
                    bio = _strip_ig_meta_prefix(desc)
            except Exception:
                pass

        # ── Follower count from JSON (very reliable) ───────────────────
        follower_count = 0
        for pattern in [
            r'"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)',
            r'"follower_count"\s*:\s*(\d+)',
            r'"followers"\s*:\s*\{[^}]*"count"\s*:\s*(\d+)',
        ]:
            try:
                m = re.search(pattern, content)
                if m:
                    follower_count = int(m.group(1))
                    break
            except Exception:
                pass
        # Fallback to meta description parsing
        if not follower_count:
            try:
                meta = page.query_selector('meta[name="description"]')
                if meta:
                    desc = meta.get_attribute("content") or ""
                    m = re.search(r'([\d,.]+[KMk]?)\s*Followers', desc, re.IGNORECASE)
                    if m:
                        follower_count = parse_follower_count(m.group(1))
            except Exception:
                pass

        # ── External website (the link Instagram shows in bio) ─────────
        # Instagram stores links in three different places depending on
        # whether the profile has 1 link or "X and N more":
        #   - Single link → "external_url"
        #   - Multi-link  → "bio_links":[{"url":"..."}]
        #   - Newer       → "external_lynx_url" (wrapped redirect)
        website = ""
        all_links = extract_urls_from_text(bio)
        all_links.extend(_extract_instagram_bio_links(content))

        # 1) JSON external_url field — what Instagram actually shows
        try:
            m = re.search(r'"external_url":"((?:[^"\\]|\\.)*?)"', content)
            if m and m.group(1):
                all_links.append(_decode_js_string(m.group(1)).strip())
        except Exception:
            pass

        # 2) bio_links array (multi-link profiles like the "+ 1 more" case)
        try:
            # Each link is a JSON object — grab url fields one by one
            for match in re.finditer(
                r'"url":"((?:[^"\\]|\\.)*?)"\s*,\s*"link_type"',
                content,
            ):
                u = _decode_js_string(match.group(1)).strip()
                if u and u not in all_links:
                    all_links.append(u)
        except Exception:
            pass

        # 3) external_lynx_url (newer wrapped form)
        if not website:
            try:
                m = re.search(r'"external_lynx_url":"((?:[^"\\]|\\.)*?)"', content)
                if m and m.group(1):
                    raw_lynx = _decode_js_string(m.group(1))
                    if "l.instagram.com" in raw_lynx and "u=" in raw_lynx:
                        qs = parse_qs(urlparse(raw_lynx).query)
                        u = qs.get("u", [""])[0]
                        if u:
                            all_links.append(unquote(u).split("?")[0])
                    else:
                        all_links.append(raw_lynx)
            except Exception:
                pass
        # 3) Anchor-tag scan, looking for IG's l.instagram.com redirect wrapper
        if not website:
            try:
                for raw_url in re.findall(r'href="(https?://[^"]+)"', content):
                    if "l.instagram.com" in raw_url and "u=" in raw_url:
                        qs = parse_qs(urlparse(raw_url).query)
                        u = qs.get("u", [""])[0]
                        if u:
                            decoded = unquote(u).split("?")[0]
                            if decoded and "instagram.com" not in decoded:
                                all_links.append(decoded)
            except Exception:
                pass
        # 4) Last resort: generic anchor scan
        if not website:
            try:
                urls = re.findall(r'href="(https?://[^"]+)"', content)
                for url in urls:
                    normalized = _normalize_url_candidate(url)
                    if normalized and _is_primary_website_url(normalized):
                        all_links.append(normalized)
                        break
            except Exception:
                pass

        # Normalize, dedupe, and select the first real brand website. Known
        # platform/support URLs like about.meta.com stay out of Website.
        if website:
            all_links.insert(0, website)
        all_links = _dedupe_urls(all_links, allow_social=True)
        website = _pick_primary_website(all_links)

        # ── Category (e.g., "Clothing (Brand)") ────────────────────────
        category = ""
        for pattern in [
            r'"category_name":"((?:[^"\\]|\\.)*?)"',
            r'"category":"((?:[^"\\]|\\.)*?)"',
            r'"business_category_name":"((?:[^"\\]|\\.)*?)"',
        ]:
            try:
                m = re.search(pattern, content)
                if m and m.group(1) and m.group(1).lower() not in ("none", "null"):
                    category = _decode_js_string(m.group(1)).strip()
                    if category:
                        break
            except Exception:
                pass

        # ── Following & posts count (bonus stats) ──────────────────────
        following_count = 0
        post_count = 0
        try:
            m = re.search(r'"edge_follow"\s*:\s*\{\s*"count"\s*:\s*(\d+)', content)
            if m:
                following_count = int(m.group(1))
        except Exception:
            pass
        try:
            m = re.search(r'"edge_owner_to_timeline_media"\s*:\s*\{\s*"count"\s*:\s*(\d+)', content)
            if m:
                post_count = int(m.group(1))
        except Exception:
            pass

        # ── Verified flag ──────────────────────────────────────────────
        is_verified = False
        try:
            m = re.search(r'"is_verified":(true|false)', content)
            if m:
                is_verified = m.group(1) == "true"
        except Exception:
            pass

        # ── City detection (from bio) ──────────────────────────────────
        city = ""
        try:
            haystack = (bio + " " + (category or "")).lower()
            for city_name in [
                "Mumbai", "Delhi", "New Delhi", "Bangalore", "Bengaluru", "Hyderabad",
                "Chennai", "Kolkata", "Jaipur", "Surat", "Pune", "Ahmedabad",
                "Lucknow", "Gurugram", "Gurgaon", "Noida", "Chandigarh", "Indore",
                "Udaipur", "Jodhpur", "Kochi", "Amritsar", "Varanasi",
            ]:
                if city_name.lower() in haystack:
                    city = city_name.replace("Gurgaon", "Gurugram")
                    break
        except Exception:
            pass

        # ── Niche tags from bio + category ─────────────────────────────
        niche_map = {
            "saree": "sarees", "lehenga": "lehengas", "kurta": "kurtas",
            "ethnic": "ethnic wear", "handloom": "handloom",
            "sustainable": "sustainable fashion", "streetwear": "streetwear",
            "bridal": "bridal wear", "kids": "kidswear",
            "silk": "silk", "khadi": "khadi", "shirt": "shirts",
            "modest": "modest wear", "western": "western wear",
            "fusion": "fusion wear", "denim": "denim", "bandhani": "bandhani",
            "block print": "block print", "organic": "organic",
        }
        combined = (bio + " " + (category or "")).lower()
        niches = list({v for k, v in niche_map.items() if k in combined}) or ["fashion"]

        # ── Contact info (email/phone from JSON or bio text) ───────────
        contact = extract_contact_info(content)
        # Instagram business profiles expose public_email / contact_phone_number in JSON
        if not contact["email"]:
            try:
                m = re.search(r'"public_email":"((?:[^"\\]|\\.)*?)"', content)
                if m and m.group(1) and "@" in m.group(1):
                    contact["email"] = _decode_js_string(m.group(1)).strip()
            except Exception:
                pass
            try:
                m = re.search(r'"business_email":"((?:[^"\\]|\\.)*?)"', content)
                if m and m.group(1) and "@" in m.group(1):
                    contact["email"] = _decode_js_string(m.group(1)).strip()
            except Exception:
                pass
        if not contact["phone"]:
            try:
                m = re.search(r'"public_phone_number":"((?:[^"\\]|\\.)*?)"', content)
                if m and m.group(1):
                    contact["phone"] = _decode_js_string(m.group(1)).strip()
            except Exception:
                pass
            try:
                m = re.search(r'"business_phone_number":"((?:[^"\\]|\\.)*?)"', content)
                if m and m.group(1):
                    contact["phone"] = _decode_js_string(m.group(1)).strip()
            except Exception:
                pass
        # Bio often has the email/phone in plain text too
        if bio:
            bio_contact = extract_contact_info(bio)
            for k, v in bio_contact.items():
                if v and not contact.get(k):
                    contact[k] = v

        seed = (name[:2].upper() or "IG")

        # Deduplicate bio_links and put website first
        bio_links = []
        for url in ([website] if website else []) + all_links:
            if url and url not in bio_links:
                bio_links.append(url)

        return {
            "brandName": name or handle,
            "handle": handle,
            "platform": "instagram",
            "avatar": f"https://api.dicebear.com/9.x/initials/svg?seed={seed}&backgroundColor=ec4899&fontColor=ffffff",
            "bio": (bio[:500] or "Indian fashion brand on Instagram"),
            "category": category or "",
            "followerCount": follower_count,
            "followingCount": following_count,
            "postCount": post_count,
            "isVerified": is_verified,
            "website": website or None,
            "bioLinks": bio_links,
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
        all_links = extract_urls_from_text(bio)
        try:
            urls = re.findall(r'href="(https?://[^"]+)"', content)
            for url in urls:
                normalized = _normalize_url_candidate(url)
                if normalized and _is_primary_website_url(normalized):
                    all_links.append(normalized)
                    break
        except Exception:
            pass
        all_links = _dedupe_urls(all_links, allow_social=True)
        website = _pick_primary_website(all_links)

        # Contact info from page content (rare on LinkedIn but possible from bio)
        contact = extract_contact_info(content)
        if bio:
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
            "bioLinks": all_links,
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
