import json
import re
import anthropic
from openai import OpenAI
from app.core.config import settings
from app.models.schemas import Lead


def _build_prompt(template: str, lead: Lead, variables: list[str]) -> str:
    lead_profile = f"""
Brand Name: {lead.brandName}
Handle: {lead.handle}
Platform: {lead.platform}
Bio: {lead.bio}
Follower Count: {lead.followerCount}
City: {lead.city}
Niches: {', '.join(lead.niches)}
Website: {lead.website or 'None'}
"""
    return f"""You are an AI assistant helping fill in personalized message template variables for a B2B sales outreach message targeting an Indian fashion brand.

Here is the brand's profile:
{lead_profile}

Here is the message template:
{template}

The template contains these variables that need to be filled in: {', '.join([f'{{{{{v}}}}}' for v in variables])}

Fill in each variable with the most appropriate, natural-sounding value based on the brand's profile.

Rules:
- Make the values sound authentic and personalized, not generic
- For product_style: describe their specific fashion niche in 3-5 words
- For brand_name: use the exact brand name from the profile
- For platform: capitalize properly (Instagram, Facebook, LinkedIn)
- For niche: use their primary fashion category
- For city: use their exact city
- For follower_count: format as "48.2K" or "1.2M" style
- For website: use just the domain without https://

Return ONLY the filled-in message with all variables replaced. Do not add any explanation or commentary."""


def _call_anthropic(prompt: str) -> str:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


def _call_deepseek(prompt: str) -> str:
    # DeepSeek exposes an OpenAI-compatible API — same SDK, different base_url + key
    if not settings.deepseek_api_key:
        raise ValueError("DEEPSEEK_API_KEY is not configured")
    client = OpenAI(
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
        timeout=30,
    )
    response = client.chat.completions.create(
        model=settings.deepseek_model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content.strip()


def fill_template_vars(template: str) -> list[str]:
    variables = re.findall(r'\{\{(\w+)\}\}', template)
    return list(set(variables))


def personalize_message(template: str, lead: Lead) -> str:
    """
    Personalizes the message template for a single lead.
    Uses whichever provider is set in config: 'anthropic' or 'deepseek'.
    """
    variables = fill_template_vars(template)
    if not variables:
        return template

    prompt = _build_prompt(template, lead, variables)

    if settings.ai_provider == "deepseek":
        return _call_deepseek(prompt)
    else:
        return _call_anthropic(prompt)


def enrich_lead_profile(lead_data: dict) -> dict:
    """
    Parse a scraped brand profile with an LLM to extract structured fields
    that aren't reliably available via regex (products, payment methods,
    shipping policy, owner handle, etc.).

    Returns a dict with these keys (any may be empty string):
      - description       : One-line clean summary of what the brand sells
      - products          : Specific items they sell (comma-separated)
      - priceRange        : "budget" | "mid" | "premium" | "luxury" | ""
      - paymentMethods    : "Cash on Delivery, UPI, Cards" etc.
      - shippingPolicy    : "5 days domestic, no international" etc.
      - ownerHandle       : The @ handle of the brand owner if mentioned
      - city              : Inferred city if the bio mentions one
      - language          : "English" | "Hindi" | "Hinglish" | "Mixed"
      - email             : Public email if mentioned
      - phone             : Public phone/mobile number if mentioned
      - whatsapp          : WhatsApp number if explicitly mentioned
      - website           : Primary website/link if mentioned
      - urls              : All URLs mentioned, pipe-separated
    """
    bio = (lead_data.get("bio") or "").strip()
    name = (lead_data.get("brandName") or "").strip()
    category = (lead_data.get("category") or "").strip()
    handle = (lead_data.get("handle") or "").strip()
    website = (lead_data.get("website") or "").strip()
    bio_links = lead_data.get("bioLinks") or []
    if isinstance(bio_links, list):
        bio_links = " | ".join(str(link) for link in bio_links if link)
    else:
        bio_links = str(bio_links)

    if not bio and not category:
        return {}

    prompt = f"""You are analyzing the Instagram/Facebook profile of an Indian fashion brand.

Brand Name: {name}
Handle: {handle}
Platform Category: {category}
Known Website: {website}
Known Bio Links: {bio_links}
Bio Text:
\"\"\"
{bio}
\"\"\"

Extract structured information from this profile. Return ONLY valid JSON with these exact keys (use empty string "" for unknown fields):

{{
  "description": "One short sentence describing what they sell, max 12 words",
  "products": "Comma-separated specific products (e.g. 'T-shirts, oversized tees')",
  "priceRange": "One of: budget, mid, premium, luxury, or empty string",
  "paymentMethods": "Comma-separated payment options mentioned (e.g. 'Cash on Delivery, UPI')",
  "shippingPolicy": "Short summary of shipping info (e.g. '5 days, all India')",
  "ownerHandle": "The @handle of the owner if mentioned (e.g. '@bhatti_milan.7')",
  "city": "Indian city if explicitly mentioned, else empty string",
  "language": "One of: English, Hindi, Hinglish, Mixed",
  "email": "Public email if present, else empty string",
  "phone": "Public phone/mobile number if present, else empty string",
  "whatsapp": "WhatsApp number if explicitly present, else empty string",
  "website": "Primary website or link if present, else empty string",
  "urls": "All URLs found in the profile or bio links, pipe-separated"
}}

Return ONLY the JSON object. No markdown fences, no commentary."""

    try:
        if settings.ai_provider == "deepseek":
            raw = _call_deepseek(prompt)
        else:
            raw = _call_anthropic(prompt)
    except Exception as e:
        print(f"[ai_service] enrich error: {e}", flush=True)
        return {}

    # Strip markdown fences if the model added them
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```\s*$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            return {}
        # Keep only string values
        return {k: (v if isinstance(v, str) else str(v)) for k, v in parsed.items()}
    except Exception as e:
        print(f"[ai_service] enrich JSON parse failed: {e} | raw: {cleaned[:200]}", flush=True)
        return {}


def test_deepseek_connection() -> dict:
    """Run a tiny live request against DeepSeek and return a safe status payload."""
    result = {
        "provider": settings.ai_provider,
        "configured": bool(settings.deepseek_api_key),
        "baseUrl": settings.deepseek_base_url,
        "model": settings.deepseek_model,
        "ok": False,
    }
    if not settings.deepseek_api_key:
        result["error"] = "DEEPSEEK_API_KEY is not configured"
        return result

    try:
        raw = _call_deepseek("Reply with exactly: OK")
        result["ok"] = raw.strip().upper().startswith("OK")
        result["reply"] = raw[:40]
    except Exception as e:
        result["error"] = str(e)
    return result


def personalize_batch(template: str, leads: list[Lead]) -> list[dict]:
    """Personalize messages for a batch of leads using the active provider."""
    results = []
    for lead in leads:
        try:
            message = personalize_message(template, lead)
            results.append({
                "leadId": lead.id,
                "message": message,
                "status": "success",
                "provider": settings.ai_provider,
                "model": settings.deepseek_model if settings.ai_provider == "deepseek" else settings.anthropic_model,
            })
        except Exception as e:
            results.append({"leadId": lead.id, "message": template, "status": "error", "error": str(e)})
    return results
