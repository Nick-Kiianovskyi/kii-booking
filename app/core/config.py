from dotenv import load_dotenv
import os

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

from decouple import config

DATABASE_URL = config("DATABASE_URL")

GOOGLE_CLIENT_ID = config("GOOGLE_CLIENT_ID")

GOOGLE_CLIENT_SECRET = config("GOOGLE_CLIENT_SECRET")

GOOGLE_REDIRECT_URI = config("GOOGLE_REDIRECT_URI")

SECRET_KEY = config("SECRET_KEY", default="development-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(config("ACCESS_TOKEN_EXPIRE_MINUTES", default="60"))

# Debug-only endpoints (e.g. Google test event) are hidden unless explicitly enabled.
DEBUG = config("DEBUG", default=False, cast=bool)

# (connect, read) timeouts applied to every outgoing Google HTTP request.
GOOGLE_REQUEST_TIMEOUT = (3, 10)

# Browser origins allowed to call the API (comma-separated in the environment).
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in config(
        "CORS_ALLOWED_ORIGINS",
        default="http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
