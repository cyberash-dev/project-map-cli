import requests


class Reporter:
    def publish(self, payload):
        return requests.post('https://reports.example/v1/publish', json=payload)

    def build_only(self, payload):
        requests.Request(method='PUT', url='https://reports.example/v1/draft')
        return None

    def build_then_send(self, session, payload):
        prepared = requests.Request(
            method='DELETE', url='https://reports.example/v1/draft'
        )
        return session.send(prepared)

    def unclassified(self):
        return requests.utils.default_headers()
