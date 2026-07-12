from pathlib import Path

# Project Root
BASE_DIR = Path(__file__).resolve().parent

# Database
DATABASE_URL = f"sqlite:///{BASE_DIR}/shorttrade.db"

# CoinGecko API
COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price"

# Supported Coins
SUPPORTED_COINS = [
    "bitcoin",
    "ethereum",
    "binancecoin",
    "solana",
    "ripple",
    "tether"
]

# App Information
APP_NAME = "ShortTrade"
APP_VERSION = "1.0.0"
