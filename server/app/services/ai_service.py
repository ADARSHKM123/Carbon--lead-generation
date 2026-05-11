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
    client = OpenAI(
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
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
