import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.models.schemas import PersonalizeRequest
from app.services.ai_service import personalize_batch, enrich_lead_profile, test_deepseek_connection

router = APIRouter()

@router.post("/personalize")
async def personalize_messages(request: PersonalizeRequest):
    """
    Uses the active AI provider (DeepSeek or Anthropic) to personalize the
    message template for each lead.
    """
    if not request.leads:
        raise HTTPException(status_code=400, detail="No leads provided")
    if not request.template:
        raise HTTPException(status_code=400, detail="No template provided")

    # Cap preview to 10 leads max per API call (full batch is processed at send time)
    preview_leads = request.leads[:10]

    results = personalize_batch(request.template, preview_leads)
    return {"messages": results, "total": len(request.leads), "previewed": len(preview_leads)}


class EnrichRequest(BaseModel):
    brandName: str = ""
    handle: str = ""
    bio: str = ""
    category: str = ""
    website: str = ""
    bioLinks: list[str] = Field(default_factory=list)


@router.post("/leads/enrich")
async def enrich_lead(request: EnrichRequest):
    """
    Run the lead profile through DeepSeek to extract structured fields:
    description, products, price range, payment methods, shipping policy,
    owner handle, city, language.
    """
    if not request.bio and not request.category:
        raise HTTPException(status_code=400, detail="Need at least a bio or category")

    # AI call is sync — run in a thread so we don't block the event loop
    data = await asyncio.to_thread(enrich_lead_profile, request.model_dump())
    return {"enrichment": data}


@router.get("/ai/deepseek/status")
async def deepseek_status():
    """Check DeepSeek configuration and run a tiny live API request."""
    data = await asyncio.to_thread(test_deepseek_connection)
    return data
