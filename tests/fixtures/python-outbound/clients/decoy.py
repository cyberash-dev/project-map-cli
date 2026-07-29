class Ledger:
    def __init__(self, rows):
        self.rows = rows

    def total(self):
        return self.rows.get('total')

    def post(self, entry):
        self.rows.append(entry)
