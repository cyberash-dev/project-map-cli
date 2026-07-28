from handlers.base import BaseHandler


class AbstractPostHandler(BaseHandler):
    async def post(self):
        raise NotImplementedError
