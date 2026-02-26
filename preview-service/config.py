from dotenv import load_dotenv
import os

load_dotenv()

REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "5"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "info")
