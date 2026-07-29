from lib.audit.client import AbstractAuditClient

from clients.base import BaseInteractionClient


class AuditClient(BaseInteractionClient, AbstractAuditClient):
    REQUEST_TIMEOUT = 3
