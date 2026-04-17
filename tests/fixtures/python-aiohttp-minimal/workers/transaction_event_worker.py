EVENT_TYPE_TRANSACTION_CREATED = "EVENT_TYPE_TRANSACTION_CREATED"
EVENT_TYPE_TRANSACTION_REFUNDED = "EVENT_TYPE_TRANSACTION_REFUNDED"


class TransactionEventWorker:
    action_class = "ProcessTransactionEventAction"

    def __init__(self) -> None:
        self.events = [EVENT_TYPE_TRANSACTION_CREATED, EVENT_TYPE_TRANSACTION_REFUNDED]

    async def run(self) -> None:
        pass

    async def handle(self, event: str) -> None:
        pass
