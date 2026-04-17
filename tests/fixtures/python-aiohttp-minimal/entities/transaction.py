from decimal import Decimal
from uuid import UUID

from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Transaction(Base):
    __tablename__ = "transactions"

    transaction_id: UUID = Column(Integer, primary_key=True)
    status: str = Column(String)
    amount: Decimal = Column(String)
    currency: str = Column(String)

    def create(self) -> None:
        pass

    def rollback(self) -> None:
        pass

    def _apply_3ds(self) -> None:
        pass
