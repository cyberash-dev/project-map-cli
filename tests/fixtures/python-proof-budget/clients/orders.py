from vendor_interactions import AbstractInteractionClient

from settings import conf


class BudgetClient(AbstractInteractionClient):
    BASE_URL = conf.BUDGET_API_URL

    async def near(self, body):
        third = '/api/v1/near/{}'.format(body)
        second = third.format(body)
        first = second.format(body)
        return await self.post(url=first, json=body)

    async def deep(self, body):
        fourth = '/api/v1/deep/{}'.format(body)
        third = fourth.format(body)
        second = third.format(body)
        first = second.format(body)
        return await self.post(url=first, json=body)
