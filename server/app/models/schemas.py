from pydantic import BaseModel, Field
from typing import Optional, List

class Lead(BaseModel):
    id: str
    brandName: str
    handle: str
    platform: str
    bio: str
    followerCount: int
    website: Optional[str] = None
    bioLinks: List[str] = Field(default_factory=list)
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    city: str
    niches: List[str]
    hasWebsite: bool
    hasEmail: bool
    hasPhone: bool = False
    hasWhatsapp: bool = False

class PersonalizeRequest(BaseModel):
    leads: List[Lead]
    template: str

class PersonalizeResponse(BaseModel):
    leadId: str
    message: str

class DiscoverRequest(BaseModel):
    hashtags: List[str]
    platforms: List[str]
    limit: int = 50

class SendRequest(BaseModel):
    campaignId: str
    leadIds: List[str]
