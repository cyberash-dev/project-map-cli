from aiohttp import web

from routes.merchant import MERCHANT_ROUTES
from routes.utility import UTILITY_ROUTES


class RoutedApplication(web.Application):
    _urls = (
        MERCHANT_ROUTES,
        UTILITY_ROUTES,
    )


def main():
    web.run_app(RoutedApplication(), port=8080)
