from vendor.handlers import ExternalHandler
from vendor.routing_dsl import Url

from handlers import GetHandler

COMMON_ROUTES = (
    Url('/ping', GetHandler, name='ping'),
    Url('/health', ExternalHandler, name='health'),
)
