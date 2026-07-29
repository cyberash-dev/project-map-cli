from vendor_interactions import AbstractInteractionClient


class BaseInteractionClient(AbstractInteractionClient):
    REQUEST_TIMEOUT = 5
