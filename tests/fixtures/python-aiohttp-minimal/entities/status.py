from enum import Enum


class TransactionStatus(Enum):
    NEW = "NEW"
    PENDING = "PENDING"
    AUTHORIZED = "AUTHORIZED"
    CHARGED = "CHARGED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
