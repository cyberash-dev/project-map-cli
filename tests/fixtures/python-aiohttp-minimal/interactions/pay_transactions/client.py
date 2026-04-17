class PayTransactionsClient:
    def __init__(self) -> None:
        self.url = conf.settings.PAY_TRANSACTIONS_URL

    async def create_transaction(self) -> None:
        pass

    async def get_transaction(self) -> None:
        pass

    async def refund_transaction(self) -> None:
        pass
