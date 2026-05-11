from fastapi import APIRouter
from app.models.schemas import SendRequest

router = APIRouter()

@router.post("/send")
async def send_campaign(request: SendRequest):
    """
    Triggers the outreach queue for the approved leads.
    In production, this enqueues Celery tasks for each lead with rate-limited sending.
    """
    # Production: for each leadId, enqueue a Celery task:
    # send_dm_task.apply_async(args=[lead_id, campaign_id], countdown=delay)
    # with exponential backoff and daily limit enforcement

    return {
        "status": "queued",
        "campaignId": request.campaignId,
        "queuedCount": len(request.leadIds),
        "message": f"Outreach queued for {len(request.leadIds)} leads"
    }
