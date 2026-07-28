from handlers.base import BaseHandler


class PingHandler(BaseHandler):
    async def get(self):
        return None


def request_schema(schema):
    def wrap(fn):
        return fn

    return wrap


class DecoratedHandler(BaseHandler):
    @request_schema(None)
    async def delete(self):
        return None
