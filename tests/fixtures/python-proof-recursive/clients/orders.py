from vendor_interactions import AbstractInteractionClient

from settings import conf


class LoopingClient(AbstractInteractionClient):
    BASE_URL = conf.LOOPING_API_URL

    async def refresh(self, body):
        url = '/api/v1/refresh/{}'
        url = url.format(body)
        return await self.post(url=url, json=body)
