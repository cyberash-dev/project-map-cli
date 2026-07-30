package bunker

type Config struct {
	Endpoint string
	Timeout  int
}

func (c *Config) SnapshotRoots() []string {
	return nil
}

func (c *Config) GetServiceToken() string {
	return ""
}

const (
	ModeDraft Kind = "draft"
	ModeLive  Kind = "live"
)
