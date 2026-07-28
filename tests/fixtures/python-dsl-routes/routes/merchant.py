from vendor.sendr_aiohttp import PrefixedUrl

from handlers.merchant import MerchantOrdersHandler


class Url(PrefixedUrl):
    PREFIX = '/api/merchant'


MERCHANT_ROUTES = (
    Url(r'/v1/orders/{order_id:[^/]+}', MerchantOrdersHandler, name='order'),
)
