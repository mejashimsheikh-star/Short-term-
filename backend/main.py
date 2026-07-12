from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
import models
from market import get_market_prices

app = FastAPI(
    title="ShortTrade API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def home():
    return {
        "name": "ShortTrade API",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/market")
async def market():
    return await get_market_prices()
