from aiohttp import web

from handlers.transactions import TransactionsHandler, TransactionActionHandler


def register_routes(app: web.Application) -> None:
    app.router.add_route("POST", "/api/v1/transactions", TransactionsHandler)
    app.router.add_route("GET", "/api/v1/transactions/{id}", TransactionActionHandler)
    app.router.add_post("/api/v1/refunds", TransactionsHandler)
