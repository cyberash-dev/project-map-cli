from gen.orders_api import read_order


class GeneratedCaller:
    def fetch(self, order_id):
        return read_order(order_id)
