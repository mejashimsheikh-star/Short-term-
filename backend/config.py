import os

DATABASE_URL = os.getenv("postgresql://shorttrade_user:SS1SONI2SXYqlQHZJK56O1GFL1SKAznL@dpg-da2sm31t0dsc73b45jg0-a/shorttrade")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing from the render environment veriables")

COINGECKO_API = (
    "https://api.coingecko.com/api/v3/simple/price"
)

SUPPORTED_COINS = [
    "bitcoin",
    "ethereum",
    "binancecoin",
    "solana",
    "ripple",
    "tether"
]

APP_NAME = "ShortTrade"
APP_VERSION = "1.0.0"
