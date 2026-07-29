from vendor_interactions import AbstractInteractionClient, ConfiguredClient

from settings import conf


class BaseClient(AbstractInteractionClient):
    REQUEST_TIMEOUT = 5


class OrdersClient(BaseClient):
    BASE_URL = conf.ORDERS_API_URL

    async def create_order(self, body):
        return await self.post(
            interaction_method='create_order',
            url=self.endpoint_url('/api/v1/orders'),
            json=body,
        )

    async def read_order(self, order_id):
        return await self.get(
            interaction_method='read_order',
            url=self.endpoint_url(f'/api/v1/orders/{order_id}'),
        )

    async def ping(self):
        self.retry(1)
        return await self.trace('/ping')

    def _stamp(self, body):
        self.retry(2)
        self.retry(3)
        return body


class TenantClient(ConfiguredClient):
    async def notify(self, body):
        return await self.post(url='/notify', json=body)


def build_tenants():
    return [
        TenantClient(base_url=conf.TENANT_ONE_URL),
        TenantClient(base_url=conf.TENANT_TWO_URL),
    ]


async def notify_one(body):
    client = TenantClient(base_url=conf.TENANT_ONE_URL)
    return await client.post(url='/notify-one', json=body)
