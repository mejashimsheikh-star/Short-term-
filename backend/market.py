import asyncio
import time
import httpx

from config import COINGECKO_API, SUPPORTED_COINS


_cache = None
_cache_time = 0

CACHE_SECONDS = 30


async def get_market_prices():

    global _cache, _cache_time

    # Return cached prices for 30 seconds
    if _cache and (time.time() - _cache_time) < CACHE_SECONDS:
        return _cache

    params = {
        "ids": ",".join(SUPPORTED_COINS),
        "vs_currencies": "usd",
        "include_24hr_change": "true"
    }

    try:

        async with httpx.AsyncClient(timeout=10) as client:

            for attempt in range(3):

                response = await client.get(
                    COINGECKO_API,
                    params=params
                )

                if response.status_code == 429:

                    if attempt < 2:
                        await asyncio.sleep(2)
                        continue

                    # If we have old prices, return them
                    if _cache:
                        return _cache

                    return {
                        "error": "Market API rate limit reached. Please try again later."
                    }

                response.raise_for_status()

                data = response.json()

                _cache = data
                _cache_time = time.time()

                return data

    except Exception as e:

        if _cache:
            return _cache

        return {
            "error": "Unable to load market prices."
        }
