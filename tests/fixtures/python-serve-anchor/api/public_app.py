from api.base_app import BaseApplication
from routes.form import FORM_ROUTES
from routes.legacy import LEGACY_ROUTES
from routes.utility import UTILITY_ROUTES


class PublicApplication(BaseApplication):
    _urls = (
        FORM_ROUTES,
        UTILITY_ROUTES,
    )
    _legacy_urls = (
        LEGACY_ROUTES,
    )
