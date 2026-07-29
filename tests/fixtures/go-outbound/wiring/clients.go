package wiring

import (
	"example.com/svc/interactions"
	"example.com/svc/interactions/debts"
)

type AppConfig struct {
	Debts interactions.Config
}

func Build(cfg *AppConfig) error {
	_, err := debts.NewClient(&cfg.Debts)
	return err
}
