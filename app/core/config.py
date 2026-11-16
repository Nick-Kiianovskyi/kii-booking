from dotenv import load_dotenv
import os

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

from decouple import config

DATABASE_URL = config("DATABASE_URL")

GOOGLE_CLIENT_ID = config("GOOGLE_CLIENT_ID")

GOOGLE_CLIENT_SECRET = config("GOOGLE_CLIENT_SECRET")

GOOGLE_REDIRECT_URI = config("GOOGLE_REDIRECT_URI")
