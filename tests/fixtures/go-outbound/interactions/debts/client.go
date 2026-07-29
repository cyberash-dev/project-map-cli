package debts

import "example.com/svc/interactions"

type Client struct {
	interactions.Client
}

func NewClient(config *interactions.Config) (*Client, error) {
	return &Client{interactions.NewClient(config)}, nil
}
