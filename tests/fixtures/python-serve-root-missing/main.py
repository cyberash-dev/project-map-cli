from aiohttp import web

from deployment.factory import build_application


def main():
    web.run_app(build_application(), port=8080)
