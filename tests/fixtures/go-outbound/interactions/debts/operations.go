package debts

import "example.com/svc/interactions"

func (c *Client) CreateRepayment(id string) error {
	req := interactions.NewRequest()
	req.APIMethod = "/repayment/create"
	req.Method = interactions.HTTPPost

	resp := struct{}{}
	return c.MakeRequestWithError(req, &resp, nil)
}

func (c *Client) ListRepayments() error {
	req := interactions.NewRequest()
	req.APIMethod = "/repayment/list"

	resp := struct{}{}
	return c.MakeRequest(req, &resp)
}

func (c *Client) Untraceable(path string) error {
	req := interactions.NewRequest()
	req.APIMethod = path

	resp := struct{}{}
	return c.MakeRequest(req, &resp)
}
