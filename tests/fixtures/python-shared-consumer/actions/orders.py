class GetOrder:
    async def run(self, order_id):
        return await self.clients.split.get_order(order_id)


class RecordAudit:
    async def run(self, body):
        return await self.clients.audit.record(body)


class DynamicOperation:
    async def run(self, name, order_id):
        return await getattr(self.clients.split, name)(order_id)
