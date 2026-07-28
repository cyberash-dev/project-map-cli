class Url:
    """Shares a name with the DSL and originates nowhere near it."""

    def __init__(self, path, handler, name=None):
        self.path = path


DECOY_ROUTES = (
    Url('/not-a-route', object, name='decoy'),
)


def read_header(request):
    return request.headers.get('X-Merchant-ID')
