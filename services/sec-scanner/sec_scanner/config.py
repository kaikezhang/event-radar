from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    sec_poll_interval: int = 30  # seconds
    backend_url: str = "http://localhost:3001"
    sec_user_agent: str = "EventRadar/0.1 (event-radar@example.com)"
    scanner_port: int = 3002
    api_key: str = "er-dev-2026"

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
