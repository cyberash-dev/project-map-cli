from aiohttp import web


class Handler:
    def respond(self, body):
        return web.Response(body=body)
