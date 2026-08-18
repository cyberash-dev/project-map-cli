from aiohttp import web

from routes.common import COMMON_ROUTES


class BaseApplication(web.Application):
    _urls = (
        COMMON_ROUTES,
    )
