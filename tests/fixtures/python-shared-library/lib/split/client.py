from vendor_interactions import AbstractInteractionClient


class AbstractSplitClient(AbstractInteractionClient):
    async def get_order(self, order_id):
        return await self.get(url=f'/orders/{order_id}')

    async def create_order(self, body):
        return await self.post(url='/orders', json=body)
