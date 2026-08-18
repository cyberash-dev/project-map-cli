from vendor.routing_dsl import PrefixedUrl

from handlers import GetHandler


class Url(PrefixedUrl):
    PREFIX = '/api/form'


FORM_ROUTES = (
    Url('/v1/checkout', GetHandler, name='checkout'),
)
