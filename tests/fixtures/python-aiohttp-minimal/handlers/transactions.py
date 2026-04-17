from aiohttp import web


class TransactionsHandler:
    async def post(self, request: web.Request) -> web.Response:
        return web.Response()

    async def get(self, request: web.Request) -> web.Response:
        return web.Response()


class TransactionActionHandler:
    async def get(self, request: web.Request) -> web.Response:
        return web.Response()
