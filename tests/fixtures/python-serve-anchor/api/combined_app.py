from api.public_app import PublicApplication
from routes.internal import INTERNAL_ROUTES


class CombinedApplication(PublicApplication):
    _urls = PublicApplication._urls + (
        INTERNAL_ROUTES,
    )
    _legacy_urls = ()
