from vendor.routing_dsl import Url

from handlers import GetHandler

LEGACY_ROUTES = (
    Url('/legacy', GetHandler, name='legacy'),
)
