from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent


DATABASE_URL = f"sqlite:///{BASE_DIR}/shorttrade.db"


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
