from vendor.routing_dsl import Url

from handlers import GetHandler

UTILITY_ROUTES = (
    Url('/ping', GetHandler, name='ping'),
)
