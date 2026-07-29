from clients.audit import AuditClient
from clients.split import SplitClient


class InteractionClients:
    split: SplitClient
    audit: AuditClient
