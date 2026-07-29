from settings import conf

from clients.base import BaseInteractionClient


class LedgerClient(BaseInteractionClient):
    BASE_URL = conf.LEDGER_API_URL

    def _stamp(self, body):
        return body

    async def append(self, body):
        return await self.post(url='/ledger', json=self._stamp(body))
