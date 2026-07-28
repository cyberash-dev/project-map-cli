from vendor.sendr_aiohttp import Url

from handlers.utility import DecoratedHandler, PingHandler

UTILITY_ROUTES = (
    Url(r'/ping', PingHandler, name='ping'),
    Url(r'/decorated', DecoratedHandler, name='decorated'),
)
