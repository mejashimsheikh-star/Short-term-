from sqlalchemy.orm import Session

from models import User


def find_user_by_wallet(
    db: Session,
    wallet_address: str
):

    return db.query(User).filter(
        User.wallet_address == wallet_address
    ).first()



def update_wallet(
    db: Session,
    user_id: str,
    wallet_address: str
):

    user = db.query(User).filter(
        User.user_id == user_id
    ).first()


    if not user:
        return None


    user.wallet_address = wallet_address

    db.commit()
    db.refresh(user)


    return user
