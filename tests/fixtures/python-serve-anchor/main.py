from aiohttp import web

from api.badges_app import BadgesApplication
from api.cms_app import CmsApplication
from api.combined_app import CombinedApplication


def main(combined):
    if combined:
        app = CombinedApplication()
    else:
        app = BadgesApplication()

    web.run_app(app, port=8080)


def serve_cms():
    web.run_app(CmsApplication(), port=8081)
