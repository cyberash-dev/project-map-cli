from vendor.sendr_aiohttp import ShiftedUrl, Url

from handlers.utility import DecoratedHandler, PingHandler

UTILITY_ROUTES = (
    Url(r'/ping', PingHandler, name='ping'),
    Url(r'/decorated', DecoratedHandler, name='decorated'),
    ShiftedUrl('metadata', r'/shifted', PingHandler),
)
