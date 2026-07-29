from lib.split.client import AbstractSplitClient
from settings import conf

from clients.base import BaseInteractionClient


class SplitClient(BaseInteractionClient, AbstractSplitClient):
    BASE_URL = conf.SPLIT_API_URL
