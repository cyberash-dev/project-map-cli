from vendor.routing_dsl import ShiftedUrl, Url

from handlers.utility import DecoratedHandler, PingHandler

UTILITY_ROUTES = (
    Url(r'/ping', PingHandler, name='ping'),
    Url(r'/decorated', DecoratedHandler, name='decorated'),
    ShiftedUrl('metadata', r'/shifted', PingHandler),
)
