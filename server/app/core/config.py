from pydantic_settings import BaseSettings
from typing import Literal

class Settings(BaseSettings):
    # Anthropic
    anthropic_api_key: str = ""

    # DeepSeek (OpenAI-compatible)
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"

    # Meta Graph API (for compliant Instagram discovery)
    meta_access_token: str = ""
    instagram_business_account_id: str = ""

    # HikerAPI (third-party Instagram scraping)
    hiker_api_key: str = ""

    # Active AI provider — change this to switch models
    # Options: "anthropic" | "deepseek"
    ai_provider: Literal["anthropic", "deepseek"] = "anthropic"

    # Model to use per provider
    anthropic_model: str = "claude-sonnet-4-6"
    deepseek_model: str = "deepseek-chat"  # or "deepseek-reasoner" for R1

    # Database
    database_url: str = "postgresql://postgres:password@localhost:5432/carbon_outreach"
    redis_url: str = "redis://localhost:6379"

    # Email
    sendgrid_api_key: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # Outreach safety
    outreach_min_delay: int = 30
    outreach_max_delay: int = 120

    class Config:
        env_file = ".env"

settings = Settings()
