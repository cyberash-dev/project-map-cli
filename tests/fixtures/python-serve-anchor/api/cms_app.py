from api.base_app import BaseApplication
from routes.cms import CMS_ROUTES


class CmsApplication(BaseApplication):
    _urls = (
        CMS_ROUTES,
    )
