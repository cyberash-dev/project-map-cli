from vendor.routing_dsl import PrefixedUrl

from handlers import GetHandler


class Url(PrefixedUrl):
    PREFIX = '/api/cms'


RETAIL_ROUTES = (
    Url('/v1/retailcrm/config', GetHandler, name='retailcrm_config'),
)


CMS_ROUTES = (
    *RETAIL_ROUTES,
    Url('/v1/tilda/orders', GetHandler, name='tilda_orders'),
)
