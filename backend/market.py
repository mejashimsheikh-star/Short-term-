import httpx

from config import COINGECKO_API, SUPPORTED_COINS


async def get_market_prices():

    params = {
        "ids": ",".join(SUPPORTED_COINS),
        "vs_currencies": "usd",
        "include_24hr_change": "true"
    }


    try:

        async with httpx.AsyncClient(
            timeout=10
        ) as client:

            response = await client.get(
                COINGECKO_API,
                params=params
            )


            response.raise_for_status()


            return response.json()


    except Exception as e:

        return {
            "error": str(e)
        }
