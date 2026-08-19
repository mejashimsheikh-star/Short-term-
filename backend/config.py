import os

DATABASE_URL = os.getenv("DATABASE_URL")

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
