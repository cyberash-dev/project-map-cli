from vendor_interactions import AbstractInteractionClient

from settings import conf


class OrdersClient(AbstractInteractionClient):
    BASE_URL = conf.ORDERS_API_URL

    async def create_order(self, body):
        return await self.post(interaction_method='create_order', json=body)
