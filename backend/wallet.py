from sqlalchemy.orm import Session
from models import User


def get_user_by_wallet(db: Session, wallet_address: str):
    return db.query(User).filter(
        User.wallet_address == wallet_address
    ).first()


def create_user(db: Session, user_id: str, wallet_address: str):
    user = User(
        user_id=user_id,
        wallet_address=wallet_address
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user
