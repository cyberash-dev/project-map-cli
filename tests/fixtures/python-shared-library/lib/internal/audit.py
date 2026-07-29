from vendor_interactions import AbstractInteractionClient


class AuditClient(AbstractInteractionClient):
    BASE_URL = 'https://audit.internal'

    async def record(self, body):
        return await self.post(url='/audit', json=body)
