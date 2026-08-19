from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import uuid

from database import Base, engine, get_db
from models import User, Trade
from market import get_market_prices


Base.metadata.create_all(bind=engine)


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


@app.get("/")
def home():

    return {
        "app": "ShortTrade",
        "status": "running"
    }


@app.post("/user")
def create_user(
    db: Session = Depends(get_db)
):

    new_id = str(uuid.uuid4())

    user = User(
        user_id=new_id,
        balance=0.0
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "user_id": user.user_id
    }


@app.post("/wallet/{user_id}")
def connect_wallet(
    user_id: str,
    wallet_address: str,
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    if not user:

        return {
            "error": "User not found"
        }

    user.wallet_address = wallet_address

    db.commit()

    return {
        "message": "Wallet connected",
        "wallet": wallet_address
    }


@app.get("/market")
async def market():

    return await get_market_prices()


@app.post("/trade")
def create_trade(
    user_id: str,
    coin: str,
    trade_type: str,
    amount: float,
    price: float,
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    if not user:

        return {
            "error": "User not found"
        }

    total = amount * price

    trade = Trade(
        user_id=user_id,
        coin=coin,
        trade_type=trade_type,
        amount=amount,
        price=price,
        total=total
    )

    db.add(trade)

    db.commit()

    db.refresh(trade)

    return {
        "message": "Trade saved",
        "trade_id": trade.id
    }


@app.get("/trades/{user_id}")
def get_trades(
    user_id: str,
    db: Session = Depends(get_db)
):

    trades = db.query(Trade).filter(
        Trade.user_id == user_id
    ).order_by(
        Trade.created_at.desc()
    ).all()

    return [
        {
            "id": trade.id,
            "coin": trade.coin,
            "trade_type": trade.trade_type,
            "amount": trade.amount,
            "price": trade.price,
            "total": trade.total,
            "created_at": trade.created_at
        }
        for trade in trades
    ]
