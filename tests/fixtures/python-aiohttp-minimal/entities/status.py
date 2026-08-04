from enum import Enum


class TransactionStatus(Enum):
    NEW = "NEW"
    PENDING = "PENDING"
    AUTHORIZED = "AUTHORIZED"
    CHARGED = "CHARGED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class PaymentError(Exception):
    class ReasonCode(Enum):
        DECLINED = "DECLINED"
        EXPIRED = "EXPIRED"


class RefundError(Exception):
    class ReasonCode(Enum):
        TOO_LATE = "TOO_LATE"
        NOT_FOUND = "NOT_FOUND"
