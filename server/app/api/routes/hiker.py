"""
HikerAPI proxy routes.

HikerAPI (https://hikerapi.com) is a third-party Instagram data API.
We proxy calls through the backend so:
  1) The user's access key never lives in the browser
  2) We can normalize HikerAPI's response shape into our Lead shape
  3) CORS isn't an issue
"""
import os
import asyncio
import httpx
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.core.config import settings

router = APIRouter()

HIKER_BASE = "https://api.hikerapi.com"


def _resolve_key(header_key: Optional[str]) -> str:
    """Prefer explicit header key, fall back to env-configured key."""
    if header_key:
        return header_key.strip()
    env_key = getattr(settings, "hiker_api_key", "") or os.getenv("HIKER_API_KEY", "")
    if not env_key:
        raise HTTPException(
            status_code=400,
            detail="No HikerAPI access key provided. Save one in Settings or send via x-hiker-key header.",
        )
    return env_key


async def _hiker_get_with(
    client: httpx.AsyncClient, path: str, params: dict, key: str
) -> dict:
    """Single GET call against HikerAPI using a pre-built client."""
    headers = {"accept": "application/json", "x-access-key": key}
    try:
        r = await client.get(f"{HIKER_BASE}{path}", params=params, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"HikerAPI request failed: {e}")
    if r.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="HikerAPI rejected the access key.")
    if r.status_code >= 400:
        try:
            body = r.json()
        except Exception:
            body = {"detail": r.text}
        raise HTTPException(status_code=r.status_code, detail=body)
    return r.json()


async def _hiker_get(path: str, params: dict, key: str) -> dict:
    """Convenience wrapper that creates a one-off client for a single call."""
    async with httpx.AsyncClient(timeout=30) as client:
        return await _hiker_get_with(client, path, params, key)


async def _fetch_full_profile(
    client: httpx.AsyncClient, username: str, key: str
) -> Optional[dict]:
    """
    Fetch the full user profile by username. Returns None on failure rather
    than raising, so a single missing/private user doesn't break the batch.
    """
    try:
        data = await _hiker_get_with(client, "/v2/user/by/username", {"username": username}, key)
        user_obj = data.get("user") if isinstance(data, dict) and "user" in data else data
        return _normalize_user(user_obj) if user_obj else None
    except HTTPException as e:
        # Re-raise auth errors so the whole batch surfaces "invalid key"
        if e.status_code == 401:
            raise
        return None
    except Exception:
        return None


def _normalize_user(u: dict) -> dict:
    """
    Map a HikerAPI user object to our Lead shape.
    HikerAPI returns Instagram's GraphQL-ish field names.
    """
    if not isinstance(u, dict):
        return {}
    username = u.get("username") or ""
    full_name = u.get("full_name") or username
    pk = str(u.get("pk") or u.get("id") or u.get("pk_id") or "")
    bio = u.get("biography") or ""
    follower_count = int(u.get("follower_count") or 0)
    following_count = int(u.get("following_count") or 0)
    media_count = int(u.get("media_count") or 0)
    is_verified = bool(u.get("is_verified", False))
    is_private = bool(u.get("is_private", False))
    is_business = bool(u.get("is_business", False))
    category = u.get("category") or u.get("category_name") or ""
    external_url = u.get("external_url") or ""

    # Multi-link profiles: HikerAPI returns bio_links array
    bio_links = []
    for link in (u.get("bio_links") or []):
        if isinstance(link, dict):
            url = link.get("url") or link.get("lynx_url") or ""
            if url and url not in bio_links:
                bio_links.append(url)
    if external_url and external_url not in bio_links:
        bio_links.insert(0, external_url)

    # Contact info Instagram sometimes exposes for business accounts
    email = u.get("public_email") or u.get("business_email") or ""
    phone = u.get("contact_phone_number") or u.get("public_phone_number") or ""
    city = u.get("city_name") or ""

    avatar = (
        u.get("profile_pic_url_hd")
        or u.get("profile_pic_url")
        or f"https://api.dicebear.com/9.x/initials/svg?seed={username or full_name}&backgroundColor=ec4899&fontColor=ffffff"
    )

    return {
        "pk": pk,
        "brandName": full_name,
        "handle": f"@{username}" if username else "",
        "username": username,
        "platform": "instagram",
        "avatar": avatar,
        "bio": bio,
        "category": category,
        "followerCount": follower_count,
        "followingCount": following_count,
        "postCount": media_count,
        "isVerified": is_verified,
        "isPrivate": is_private,
        "isBusiness": is_business,
        "website": (bio_links[0] if bio_links else None),
        "bioLinks": bio_links,
        "email": email or None,
        "phone": phone or None,
        "whatsapp": None,
        "city": city or "India",
        "pageUrl": f"https://instagram.com/{username}" if username else "",
    }


@router.get("/hiker/test-key")
async def test_key(x_hiker_key: Optional[str] = Header(None)):
    """Lightweight key validation — hits a cheap endpoint."""
    key = _resolve_key(x_hiker_key)
    # Use a known-good username to verify auth works
    try:
        await _hiker_get("/v2/user/by/username", {"username": "instagram"}, key)
        return {"valid": True}
    except HTTPException as e:
        if e.status_code == 401:
            return {"valid": False, "error": "Invalid access key"}
        return {"valid": False, "error": str(e.detail)}


@router.get("/hiker/user")
async def get_user(username: str, x_hiker_key: Optional[str] = Header(None)):
    """Fetch a single Instagram user profile by username."""
    if not username:
        raise HTTPException(status_code=400, detail="username is required")
    key = _resolve_key(x_hiker_key)
    username = username.strip().lstrip("@")

    data = await _hiker_get("/v2/user/by/username", {"username": username}, key)

    # HikerAPI returns the user either directly or nested under "user"
    user_obj = data.get("user") if isinstance(data, dict) and "user" in data else data
    normalized = _normalize_user(user_obj)
    if not normalized.get("username"):
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    return {"user": normalized}


@router.get("/hiker/hashtag")
async def get_hashtag_users(
    tag: str,
    kind: str = "recent",
    limit: int = 30,
    enrich: bool = True,
    x_hiker_key: Optional[str] = Header(None),
):
    """
    Fetch posts for a hashtag, extract unique users, and enrich each one
    with their full profile (bio, follower count, website, etc.) by calling
    /v2/user/by/username in parallel.

    Hashtag feed responses only contain thin user objects (username + avatar
    + verified flag), so enrichment is required to get the data the UI
    actually wants to render.

    Set enrich=false to skip the per-user lookups (faster but cards will be
    bare).
    """
    if not tag:
        raise HTTPException(status_code=400, detail="tag is required")
    key = _resolve_key(x_hiker_key)
    tag = tag.strip().lstrip("#")
    if kind not in ("top", "recent"):
        kind = "recent"

    path = "/v2/hashtag/medias/top" if kind == "top" else "/v2/hashtag/medias/recent"
    data = await _hiker_get(path, {"name": tag}, key)

    # Response shape varies: { "items": [...] } or { "response": { "sections": [...] } }
    items = []
    if isinstance(data, dict):
        if "items" in data and isinstance(data["items"], list):
            items = data["items"]
        elif "response" in data and isinstance(data["response"], dict):
            for section in data["response"].get("sections", []) or []:
                layout = section.get("layout_content", {}) or {}
                medias = layout.get("medias") or []
                for m in medias:
                    media = m.get("media") if isinstance(m, dict) else None
                    if media:
                        items.append(media)

    # Extract unique usernames (and thin profiles as fallback)
    seen = set()
    thin_by_username: dict[str, dict] = {}
    for media in items:
        u = (media or {}).get("user")
        if not u:
            continue
        username = u.get("username")
        if not username or username in seen:
            continue
        seen.add(username)
        thin_by_username[username] = _normalize_user(u)
        if len(thin_by_username) >= limit:
            break

    usernames = list(thin_by_username.keys())

    if not enrich or not usernames:
        return {
            "users": list(thin_by_username.values()),
            "tag": tag, "kind": kind,
            "count": len(thin_by_username),
            "enriched": False,
        }

    # Parallel profile lookups with a small concurrency cap so we don't get
    # rate-limited. HikerAPI typically allows plenty of RPS but 8 in flight
    # is a safe ceiling.
    sem = asyncio.Semaphore(8)
    async with httpx.AsyncClient(timeout=30) as client:
        async def fetch_one(uname: str) -> dict:
            async with sem:
                full = await _fetch_full_profile(client, uname, key)
                # Fall back to the thin record if the full lookup fails
                # (e.g. private profiles HikerAPI can't fetch in detail)
                return full or thin_by_username[uname]

        users = await asyncio.gather(*(fetch_one(u) for u in usernames))

    return {
        "users": users,
        "tag": tag, "kind": kind,
        "count": len(users),
        "enriched": True,
    }
