from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    # Automatic User ID
    user_id = Column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    # Coinbase Wallet Address
    wallet_address = Column(
        String,
        unique=True,
        nullable=True
    )

    # Demo Balance
    balance = Column(
        Float,
        default=0.0
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class Trade(Base):
    __tablename__ = "trades"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    user_id = Column(
        String,
        index=True,
        nullable=False
    )

    coin = Column(
        String,
        nullable=False
    )

    trade_type = Column(
        String,
        nullable=False
    )

    amount = Column(
        Float,
        nullable=False
    )

    price = Column(
        Float,
        nullable=False
    )

    total = Column(
        Float,
        nullable=False
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

