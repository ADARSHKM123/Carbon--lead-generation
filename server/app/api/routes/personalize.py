from fastapi import APIRouter, HTTPException
from app.models.schemas import PersonalizeRequest
from app.services.ai_service import personalize_batch

router = APIRouter()

@router.post("/personalize")
async def personalize_messages(request: PersonalizeRequest):
    """
    Uses Claude AI to personalize the message template for each lead.
    Returns a list of personalized messages ready for review.
    """
    if not request.leads:
        raise HTTPException(status_code=400, detail="No leads provided")
    if not request.template:
        raise HTTPException(status_code=400, detail="No template provided")

    # Cap preview to 10 leads max per API call (full batch is processed at send time)
    preview_leads = request.leads[:10]

    results = personalize_batch(request.template, preview_leads)
    return {"messages": results, "total": len(request.leads), "previewed": len(preview_leads)}
