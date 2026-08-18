from vendor.routing_dsl import Url

from handlers import GetHandler

ORPHAN_ROUTES = (
    Url('/orphan', GetHandler, name='orphan'),
)
