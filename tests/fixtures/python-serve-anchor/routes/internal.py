from vendor.routing_dsl import Url

from handlers import GetHandler

INTERNAL_ROUTES = (
    Url('/internal/orders', GetHandler, name='internal_orders'),
)
